export function isWorkerEventRoute(method,url){
  return method==='POST'&&(
    url==='/event'||url==='/?__GCP_CloudEventsMode=GCS_NOTIFICATION');
}

export function safeRouteDiagnostic(method,url,mode,cloudEventHeaderPresent){
  let parsed;
  try{parsed=new URL(String(url||''),'http://worker.invalid')}catch{}
  const pathname=parsed?.pathname;
  const queryKeys=parsed?[...new Set(parsed.searchParams.keys())]
    .map(key=>key==='__GCP_CloudEventsMode'?key:'other').sort():[];
  return {
    method:String(method||''),
    pathname:pathname==='/'||pathname==='/event'||pathname==='/admit'?pathname:'other',
    query_keys:queryKeys,
    eventarc_mode_matches:parsed?.searchParams.get('__GCP_CloudEventsMode')==='GCS_NOTIFICATION',
    cloud_event_header_present:cloudEventHeaderPresent===true,
    service_mode:mode,
    raw_route_matches:isWorkerEventRoute(method,url)
  };
}
