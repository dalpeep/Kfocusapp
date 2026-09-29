export function isWorkerEventRoute(method,url){
  return method==='POST'&&(
    url==='/event'||url==='/?__GCP_CloudEventsMode=GCS_NOTIFICATION');
}
