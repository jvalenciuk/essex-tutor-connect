'use client';
import {useState} from 'react';
export default function ConnectButton(){const [error,setError]=useState(''),[loading,setLoading]=useState(false);return <div><button disabled={loading} onClick={async()=>{setLoading(true);try{const r=await fetch('/api/connect/onboard',{method:'POST'});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not start onboarding');window.location.href=d.url;}catch(e){setError((e as Error).message);setLoading(false)}}}>{loading?'Opening Stripe…':'Set up tutor payouts'}</button>{error&&<p role="alert" className="error">{error}</p>}</div>}
