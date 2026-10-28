const {createHash}=require('node:crypto');
const {rest}=require('../legacy-functions/coupon-campaign-lib');
const {draw,drain}=require('./common.cjs');
exports.handler=async()=>{
 try{
  const coupons=await rest('coupons?select=*&delivery_mode=eq.raffle&is_active=eq.true&raffle_end_at=not.is.null&order=raffle_end_at.asc');
  const due=(Array.isArray(coupons)?coupons:[]).filter(c=>String(c.raffle_draw_mode||'manual')==='auto'&&Number.isFinite(Date.parse(c.raffle_end_at))&&Date.parse(c.raffle_end_at)<=Date.now());
  const report=[];
  for(const c of due){
   const key='auto-'+createHash('sha256').update(JSON.stringify([c.id,c.raffle_end_at,c.winner_count])).digest('hex');
   const r=await draw(String(c.id),{kind:'auto',key});
   report.push({coupon_id:c.id,title:c.title,target:r.target,already:r.already,selected:r.selected,remaining_after:r.remaining_after,emailed:0});
  }
  const notification=await drain();
  for(const row of report)row.emailed=notification.sentByCoupon[row.coupon_id]||0;
  return{statusCode:200,headers:{'Content-Type':'application/json'},body:JSON.stringify({ok:true,checked:due.length,report,notification})};
 }catch{
  return{statusCode:503,headers:{'Content-Type':'application/json'},body:JSON.stringify({ok:false,error:'추첨 처리 상태를 확인할 수 없습니다. 관리자에게 문의해 주세요.',code:'RAFFLE_TRANSACTION_UNAVAILABLE'})};
 }
};
