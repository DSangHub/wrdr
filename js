async function askSecond(){
  const res = await fetch('/api/clarify', {
    method:'POST',
    body: JSON.stringify({ word1: state.word1 })
  });
  const { question } = await res.json();
  showInput({ question, placeholder:"one word", onEnter: route });
}
