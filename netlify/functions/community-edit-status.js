const gate=require('./lib/community-edit-maintenance');
exports.handler=async event=>{
 if(event.httpMethod!=='GET')return {statusCode:405,headers:{'Cache-Control':'no-store'},body:''};
 const paused=gate.blocked();
 return {statusCode:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify({edit_paused:paused,message:paused?gate.MESSAGE:''})};
};
