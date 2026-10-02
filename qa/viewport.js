const trigger=document.getElementById('load-preview');
trigger.addEventListener('click',()=>{
  const frame=document.getElementById('preview');
  frame.src='../index.html?v=0.2.5';
  frame.hidden=false;
  trigger.disabled=true;
  document.getElementById('preview-status').textContent='320 CSS pixel frame opened. Ordinary app navigation is available inside the frame.';
});
