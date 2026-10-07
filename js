async function askSecond(){
  const res = await fetch('/api/clarify', {
    method:'POST',
    body: JSON.stringify({ word1: state.word1 })
  });
  const { question } = await res.json();
  showInput({ question, placeholder:"one word", onEnter: route });
}
export default async function handler(req){
  const { word1 } = await req.json();
  const r = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{Authorization:`Bearer ${process.env.OPENAI_KEY}`,"Content-Type":"application/json"},
    body: JSON.stringify({
      model:"gpt-4o-mini",
      messages:[
        {user = {
  id: "...",
  plan: "free" | "yearly",
  clicksUsed: 7,
  resetAt: "2026-11-01",
  paidAt: null
}:"system",content:"Return JSON {question,options[]} to disambiguate a 1-word search. Max 4 options."},
        {role:"user",content:word1}
      ],
      response_format:{type:"json_object"}
    })
  });
  const j = await r.json();
  return new Response(j.choices[0].message.content,{headers:{"Content-Type":"application/json"}});
}import { sql } from '@vercel/postgres';

const FREE_LIMIT = 10;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export const config = { runtime: 'edge' };

export default async function handler(req){
  if(req.method !== 'POST') return json({error:'method'}, 405);

  const { deviceId, word1, word2, destKey } = await req.json();
  if(!deviceId) return json({error:'no device'}, 400);

  // 1. Ensure user exists + roll over if the month elapsed
  await sql`
    INSERT INTO users (device_id, reset_at)
    VALUES (${deviceId}, now() + interval '30 days')
    ON CONFLICT (device_id) DO NOTHING;
  `;

  await sql`
    UPDATE users
    SET clicks_used = 0, reset_at = now() + interval '30 days'
    WHERE device_id = ${deviceId}
      AND plan = 'free'
      AND reset_at < now();
  `;

  // 2. Atomic check + increment (single statement, no race)
  const { rows } = await sql`
    UPDATE users
    SET clicks_used = clicks_used + 1
    WHERE device_id = ${deviceId}
      AND (plan = 'yearly' OR clicks_used < ${FREE_LIMIT})
    RETURNING plan, clicks_used, reset_at;
  `;

  if(rows.length === 0){
    // denied — over limit
    const { rows: cur } = await sql`
      SELECT clicks_used, reset_at FROM users WHERE device_id = ${deviceId};
    `;
    return json({
      allowed: false,
      remaining: 0,
      resetAt: cur[0]?.reset_at
    });
  }

  const u = rows[0];

  // 3. Log the click (async-safe, inside same request)
  await sql`
    INSERT INTO click_log (device_id, word1, word2, dest_key)
    VALUES (${deviceId}, ${word1}, ${word2}, ${destKey});
  `;

  return json({
    allowed: true,
    plan: u.plan,
    remaining: u.plan === 'yearly' ? null : FREE_LIMIT - u.clicks_used,
    resetAt: u.reset_at
  });
}

function json(body, status=200){
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}async function tryOpen(opt, key){
  const deviceId = getDeviceId(); // see below
  const res = await fetch('/api/click', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      deviceId,
      word1: state.word1,
      word2: state.word2,
      destKey: key
    })
  });
  const data = await res.json();

  if(data.allowed){
    updateMeterFromServer(data);
    openDestination(opt);
  }else{
    showUnlock(data.resetAt);   // paywall
  }
}function getDeviceId(){
  let id = localStorage.getItem('wrdr_device');
  if(!id){
    id = crypto.randomUUID();
    localStorage.setItem('wrdr_device', id);
  }
  return id;
}// reject if this IP created > 3 new device IDs in 24h
