'use strict';
const base={start_date:'2026-01-01',end_date:'2026-12-31',is_active:true,sort_order:0};
module.exports=[
  {...base,id:'a-lunch',business_id:'A',type:'lunch_special',title:'A 점심특선',days_of_week:[1,2,3,4,5],start_time:'11:00',end_time:'14:30'},
  {...base,id:'b-happy',business_id:'B',type:'happy_hour',title:'B Happy Hour',days_of_week:[1,2,3,4],start_time:'16:00',end_time:'19:00'},
  {...base,id:'c-lunch',business_id:'C',type:'lunch_special',title:'C 점심특선',days_of_week:[1,2,3,4,5],start_time:'11:00',end_time:'14:30'},
  {...base,id:'c-happy',business_id:'C',type:'happy_hour',title:'C Happy Hour',days_of_week:[1,2,3,4],start_time:'16:00',end_time:'19:00'},
  {...base,id:'d-off',business_id:'D',type:'lunch_special',title:'비활성',is_active:false,days_of_week:[1],start_time:'11:00',end_time:'14:00'},
  {...base,id:'e-old',business_id:'E',type:'lunch_special',title:'종료',end_date:'2026-01-31',days_of_week:[1],start_time:'11:00',end_time:'14:00'},
  {...base,id:'f-future',business_id:'F',type:'happy_hour',title:'예정',start_date:'2026-10-01',days_of_week:[4],start_time:'16:00',end_time:'19:00'},
  {...base,id:'g-night',business_id:'G',type:'happy_hour',title:'야간',days_of_week:[1],start_time:'22:00',end_time:'01:00'},
  {...base,id:'h-one',business_id:'H',type:'lunch_special',title:'첫 특선',days_of_week:[1],start_time:'11:00',end_time:'14:00'},
  {...base,id:'h-two',business_id:'H',type:'lunch_special',title:'둘째 특선',days_of_week:[1],start_time:'11:30',end_time:'14:30'}
];
