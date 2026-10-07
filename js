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
        {role:"system",content:"Return JSON {question,options[]} to disambiguate a 1-word search. Max 4 options."},
        {role:"user",content:word1}
      ],
      response_format:{type:"json_object"}
    })
  });
  const j = await r.json();
  return new Response(j.choices[0].message.content,{headers:{"Content-Type":"application/json"}});
}
