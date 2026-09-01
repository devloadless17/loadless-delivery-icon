import { it } from 'vitest';
import { beirutDayStart, beirutDayEnd, beirutDayKey } from '/home/alialahmad/projects/loadless_projects/loadless-delivery-icon/packages/shared/src/business-day';
const f = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Beirut', dateStyle:'short', timeStyle:'medium', hour12:false });
it('dbg', () => {
  for (let i=26;i<=31;i++){
    const iso=`2026-03-${String(i).padStart(2,'0')}T09:00:00Z`;
    const at=new Date(iso);
    const s=beirutDayStart(at), e=beirutDayEnd(at);
    const h=(e.getTime()+1-s.getTime())/3600000;
    console.log(iso,'| key',beirutDayKey(at),'| start',f.format(s),s.toISOString(),'| end',f.format(e),'| h',h);
  }
});
