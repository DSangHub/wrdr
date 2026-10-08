import { createHmac, timingSafeEqual } from 'node:crypto';

const LIMIT = 3;
const json = (body, status = 200, headers = {}) => Response.json(body, {status, headers: {'Cache-Control':'no-store', ...headers}});
function secret(){ return process.env.WRDR_SESSION_SECRET || process.env.OPENAI_API_KEY || process.env.OPENAI_KEY; }
function signature(payload){ return createHmac('sha256', secret()).update(payload).digest('base64url'); }
function usage(request){
  const token = (request.headers.get('cookie') || '').split(';').map(v=>v.trim()).find(v=>v.startsWith('wrdr_usage='))?.slice(11);
  if(!token) return 0;
  try{
    const [payload, sig] = token.split('.');
    const expected = signature(payload);
    if(!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return 0;
    const n = JSON.parse(Buffer.from(payload,'base64url').toString()).used;
    return Number.isInteger(n) && n >= 0 ? n : 0;
  }catch{ return 0; }
}
function cookie(used){
  const payload = Buffer.from(JSON.stringify({used})).toString('base64url');
  return 'wrdr_usage=' + payload + '.' + signature(payload) + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000';
}
export async function GET(request){
  if(!secret()) return json({remaining:3, configured:false});
  return json({remaining:Math.max(0,LIMIT-usage(request)), configured:!!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY)});
}
export async function POST(request){
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin) return json({error:'Request not allowed.'},403);
  const key=process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if(!key) return json({error:'Search is not ready yet. Please try again later.'},503);
  const used=usage(request);
  if(used>=LIMIT) return json({paymentRequired:true,remaining:0},402);
  let body;
  try{ body=await request.json(); }catch{ return json({error:'Enter words to search.'},400); }
  if(typeof body.query!=='string' || !body.query.trim() || body.query.length>300) return json({error:'Enter a search of up to 300 characters.'},400);
  try{
    const upstream=await fetch('https://api.openai.com/v1/responses',{
      method:'POST', headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(45000),
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        store:false, max_output_tokens:1000,
        instructions:'You are wrdr. Give a concise direct answer to the search words. Use web search for current facts and cite sources. No sponsored placements. If a city or location is needed and missing, ask which city; never invent their location. Never invent prices, deals, hours, traffic or closures. Credit limits depend on the issuer and individual account; do not imply access to accounts. For medicine, give general information without diagnosis or unsafe instructions.',
        input:body.query.trim(), tools:[{type:'web_search'}]
      })
    });
    if(!upstream.ok){ console.error('OpenAI request failed',upstream.status); return json({error:'Search is temporarily unavailable. This search was not counted.'},502); }
    const data=await upstream.json();
    const parts=(data.output || []).filter(item=>item.type==='message').flatMap(item=>item.content || []).filter(item=>item.type==='output_text');
    const answer=parts.map(item=>item.text).join('\n');
    if(!answer) return json({error:'No answer returned. This search was not counted.'},502);
    const sources=parts.flatMap(item=>item.annotations || []).filter(item=>item.type==='url_citation' && /^https?:\/\//.test(item.url)).map(item=>({title:item.title || item.url,url:item.url}));
    return json({answer,sources,remaining:Math.max(0,LIMIT-used-1)},200,{'Set-Cookie':cookie(used+1)});
  }catch(error){ console.error('Search failure',error.name); return json({error:'Search is temporarily unavailable. This search was not counted.'},502); }
}
