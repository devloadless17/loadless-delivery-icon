import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WebSocketGateway, WebSocketServer, type OnGatewayConnection } from '@nestjs/websockets';
import { SOCKET_EVENTS, SOCKET_ROOMS } from '@loadless/shared';
import { parse as parseCookie } from 'cookie';
import type { Server, Socket } from 'socket.io';
import { ACCESS_COOKIE } from '../auth/auth.constants';
import { RevocationService } from '../auth/revocation.service';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ORDER_EVENTS,
  type OrderAssignedEvent,
  type OrderCancelledEvent,
  type OrderCreatedEvent,
  type OrderReleasedEvent,
  type OrderStatusEvent,
} from '../orders/order-events';

interface SocketAuth {
  userId: string;
  role: 'ADMIN' | 'VENDOR' | 'DRIVER';
  vendorId?: string;
  driverId?: string;
}

/**
 * The ONLY socket surface. Server→client notifications exclusively; clients
 * never mutate over the socket. Business services emit domain events after
 * commit; this gateway maps them to rooms. Zero business logic lives here.
 */
@WebSocketGateway({ transports: ['websocket', 'polling'] })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly revocation: RevocationService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    const auth = await this.authenticate(socket);
    if (!auth) {
      socket.emit('connect_error_reason', { code: 'UNAUTHENTICATED' });
      socket.disconnect(true);
      return;
    }
    (socket.data as { auth: SocketAuth }).auth = auth;

    await socket.join(SOCKET_ROOMS.user(auth.userId));
    if (auth.role === 'ADMIN') await socket.join(SOCKET_ROOMS.admin);
    if (auth.role === 'VENDOR' && auth.vendorId) await socket.join(SOCKET_ROOMS.vendor(auth.vendorId));
    if (auth.role === 'DRIVER' && auth.driverId) {
      await socket.join(SOCKET_ROOMS.driver(auth.driverId));
      // The DB decides feed membership — never the client.
      const driver = await this.prisma.driver.findUnique({
        where: { id: auth.driverId },
        select: { dutyStatus: true, status: true },
      });
      if (driver?.status === 'ACTIVE' && driver.dutyStatus === 'ON_DUTY') {
        await socket.join(SOCKET_ROOMS.availableOrders);
      }
    }
  }

  private async authenticate(socket: Socket): Promise<SocketAuth | null> {
    const cookieHeader = socket.request.headers.cookie;
    const cookieToken = cookieHeader ? parseCookie(cookieHeader)[ACCESS_COOKIE] : undefined;
    const authToken = (socket.handshake.auth as { token?: string } | undefined)?.token;
    const token = cookieToken ?? authToken;
    if (!token) return null;

    const claims = this.tokens.verifyAccessToken(token);
    if (!claims) return null;
    if (await this.revocation.isRevoked(claims.sub, claims.tv)) return null;
    return { userId: claims.sub, role: claims.role, vendorId: claims.vid, driverId: claims.did };
  }

  // ------------------------------------------------------------ order events

  @OnEvent(ORDER_EVENTS.CREATED)
  onOrderCreated(event: OrderCreatedEvent): void {
    const payload = {
      orderId: event.orderId,
      orderNumber: event.orderNumber,
      vendorId: event.vendorId,
      vendorName: event.vendorName,
      deliveryAddressText: event.deliveryAddressText,
      deliveryCharge: event.deliveryCharge.toString(),
      currency: event.currency,
      createdAt: event.createdAt.toISOString(),
    };
    this.server.to(SOCKET_ROOMS.availableOrders).emit(SOCKET_EVENTS.ORDER_CREATED, payload);
    this.server.to(SOCKET_ROOMS.admin).emit(SOCKET_EVENTS.ORDER_CREATED, payload);
  }

  @OnEvent(ORDER_EVENTS.ASSIGNED)
  onOrderAssigned(event: OrderAssignedEvent): void {
    const payload = {
      orderId: event.orderId,
      vendorId: event.vendorId,
      driverId: event.driverId,
      driverName: event.driverName,
      assignedAt: event.assignedAt.toISOString(),
    };
    this.server
      .to([
        SOCKET_ROOMS.vendor(event.vendorId),
        SOCKET_ROOMS.admin,
        SOCKET_ROOMS.availableOrders, // so other drivers drop the card
        SOCKET_ROOMS.driver(event.driverId), // multi-device confirmation
      ])
      .emit(SOCKET_EVENTS.ORDER_ASSIGNED, payload);
  }

  @OnEvent(ORDER_EVENTS.PICKED_UP)
  onPickedUp(event: OrderStatusEvent): void {
    this.emitStatus(SOCKET_EVENTS.ORDER_PICKED_UP, event);
  }

  @OnEvent(ORDER_EVENTS.DELIVERED)
  onDelivered(event: OrderStatusEvent): void {
    this.emitStatus(SOCKET_EVENTS.ORDER_DELIVERED, event);
  }

  @OnEvent(ORDER_EVENTS.FAILED)
  onFailed(event: OrderStatusEvent): void {
    this.emitStatus(SOCKET_EVENTS.ORDER_FAILED, event);
  }

  private emitStatus(
    name: (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS],
    event: OrderStatusEvent,
  ): void {
    const payload = {
      orderId: event.orderId,
      vendorId: event.vendorId,
      driverId: event.driverId,
      status: event.status,
      at: event.at.toISOString(),
    };
    const rooms = [SOCKET_ROOMS.vendor(event.vendorId), SOCKET_ROOMS.admin];
    if (event.driverId) rooms.push(SOCKET_ROOMS.driver(event.driverId));
    this.server.to(rooms).emit(name, payload);
  }

  @OnEvent(ORDER_EVENTS.CANCELLED)
  onCancelled(event: OrderCancelledEvent): void {
    const payload = {
      orderId: event.orderId,
      vendorId: event.vendorId,
      driverId: event.driverId,
      status: event.status,
      at: event.at.toISOString(),
      wasAssigned: event.wasAssigned,
    };
    const rooms = [SOCKET_ROOMS.vendor(event.vendorId), SOCKET_ROOMS.admin];
    if (event.driverId) rooms.push(SOCKET_ROOMS.driver(event.driverId));
    if (!event.wasAssigned) rooms.push(SOCKET_ROOMS.availableOrders); // drop the pending card
    this.server.to(rooms).emit(SOCKET_EVENTS.ORDER_CANCELLED, payload);
  }

  @OnEvent(ORDER_EVENTS.RELEASED)
  onReleased(event: OrderReleasedEvent): void {
    this.server
      .to([
        SOCKET_ROOMS.vendor(event.vendorId),
        SOCKET_ROOMS.admin,
        SOCKET_ROOMS.driver(event.previousDriverId),
      ])
      .emit(SOCKET_EVENTS.ORDER_RELEASED, {
        orderId: event.orderId,
        vendorId: event.vendorId,
        previousDriverId: event.previousDriverId,
        at: event.at.toISOString(),
      });
  }

  // ------------------------------------------------------------ duty / auth

  @OnEvent('driver.duty_changed')
  async onDutyChanged(event: { driverId: string; dutyStatus: 'ON_DUTY' | 'OFF_DUTY'; at: Date }): Promise<void> {
    // Adapter-aware room moves — works unchanged with the Redis adapter.
    if (event.dutyStatus === 'ON_DUTY') {
      this.server.in(SOCKET_ROOMS.driver(event.driverId)).socketsJoin(SOCKET_ROOMS.availableOrders);
    } else {
      this.server.in(SOCKET_ROOMS.driver(event.driverId)).socketsLeave(SOCKET_ROOMS.availableOrders);
    }
    this.server.to(SOCKET_ROOMS.admin).emit(SOCKET_EVENTS.DRIVER_DUTY_CHANGED, {
      driverId: event.driverId,
      dutyStatus: event.dutyStatus,
      at: event.at.toISOString(),
    });
  }

  @OnEvent('auth.sessions_revoked')
  onSessionsRevoked(event: { userId: string; reason: 'DEACTIVATED' | 'LOGGED_OUT' }): void {
    const room = SOCKET_ROOMS.user(event.userId);
    this.server.to(room).emit(SOCKET_EVENTS.SESSION_REVOKED, { reason: event.reason });
    this.server.in(room).disconnectSockets(true);
    this.logger.log(`Disconnected sockets for user ${event.userId} (${event.reason})`);
  }

  @OnEvent('auth.token_reuse')
  onTokenReuse(event: { userId: string }): void {
    const room = SOCKET_ROOMS.user(event.userId);
    this.server.to(room).emit(SOCKET_EVENTS.SESSION_REVOKED, { reason: 'TOKEN_REUSE' });
    this.server.in(room).disconnectSockets(true);
  }
}
