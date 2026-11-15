/* SpaceX Health Tracker - app logic. Works without a server: just open index.html */
'use strict';

/* ---- elements (explicit references, no implicit globals) ---- */
const $ = id => document.getElementById(id);
const fSleep = $('fSleep'), fEx = $('fEx'), fHr = $('fHr'), fMeals = $('fMeals'),
      fVit = $('fVit'), fStress = $('fStress'), fDiary = $('fDiary'),
      stressVal = $('stressVal'), lvl = $('lvl'), xp = $('xp'), xpfill = $('xpfill'),
      saveBtn = $('saveBtn'), resetBtn = $('resetBtn');

/* =========================================================
   1. PIXEL LOGO – drawn on a 40x40 canvas, shown scaled up
   ========================================================= */
function drawLogo(){
  const c = document.getElementById('logo'), ctx = c.getContext('2d');
  ctx.clearRect(0,0,40,40);
  const px = (x,y,col)=>{ ctx.fillStyle = col; ctx.fillRect(Math.round(x),Math.round(y),1,1); };
  const shade = y => y < 18 ? '#ffffff' : y < 28 ? '#d6d8ff' : '#a9adff';
  // planet ring
  for(let a=0;a<360;a+=2){
    const r = a*Math.PI/180;
    px(19+13*Math.cos(r), 21+13*Math.sin(r), '#b8b8ff');
  }
  // tapered line: thick in the middle, thin at the tips (like the star in the logo)
  function taper(x0,y0,x1,y1,w){
    for(let t=0;t<=1;t+=0.01){
      const x = x0+(x1-x0)*t, y = y0+(y1-y0)*t;
      const half = w*(1-Math.abs(2*t-1));
      for(let dx=-half;dx<=half;dx++) px(x+dx,y,shade(y));
    }
  }
  taper(25,1,21,37,2.2);     // vertical blade
  taper(2,26,37,15,2.2);     // horizontal swoosh
  // small sparkles (plus signs)
  [[13,14],[19,12],[16,28],[22,30]].forEach(([x,y])=>{
    px(x,y,'#fff');px(x-1,y,'#fff');px(x+1,y,'#fff');px(x,y-1,'#fff');px(x,y+1,'#fff');
  });
  px(2,3,'#fff');px(37,32,'#fff');px(5,34,'#fff');
}

/* =========================================================
   2. HEALTH RULES (example limits only!)
   status: 0 = green, 1 = yellow, 2 = red
   ========================================================= */
const rules = {
  sleep : v => v>=7 ? 0 : v>=6 ? 1 : 2,
  ex    : v => v>=120 ? 0 : v>=60 ? 1 : 2,
  hr    : v => (v>=50 && v<=90) ? 0 : ((v>=40 && v<50) || (v>90 && v<=110)) ? 1 : 2,
  stress: v => v<=4 ? 0 : v<=7 ? 1 : 2,
  food  : d => (d.meals>=3 && d.vit) ? 0 : (d.meals>=3 || d.vit) ? 1 : 2
};
const indicators = [
  {name:'SLEEP',    val:d=>d.sleep+' h',    st:d=>rules.sleep(d.sleep)},
  {name:'EXERCISE', val:d=>d.ex+' min',     st:d=>rules.ex(d.ex)},
  {name:'HEART',    val:d=>d.hr+' bpm',     st:d=>rules.hr(d.hr)},
  {name:'STRESS',   val:d=>d.stress+'/10',  st:d=>rules.stress(d.stress)},
  {name:'FOOD',     val:d=>d.meals+' meals'+(d.vit?' + vit':''), st:d=>rules.food(d)}
];
const stateNames = ['NORMAL – continue the plan','ATTENTION – adjust the daily plan','CRITICAL – act now, call Earth doctors'];
const stateClass = ['G','Y','R'];

// words in the diary that raise a warning (English + Russian)
const diaryRed = ['chest','faint','blurry','vision','breath','боль в груди','зрени','обморок'];
const diaryYel = ['tired','dizzy','headache','anxious','nausea','lonely','sad','insomnia','уста','головокруж','голов','тревог'];

/* =========================================================
   3. DATA – 7 days, last item = today
   ========================================================= */
const day = (sleep,ex,hr,stress,meals,vit,diary='') => ({sleep,ex,hr,stress,meals,vit,diary});
const scenarios = {
  normal: [day(7.5,130,62,3,3,true),day(7.2,125,64,3,3,true),day(7.8,140,60,2,3,true),
           day(7.4,130,63,3,4,true),day(7.6,128,62,3,3,true),day(7.3,135,61,3,3,true),
           day(7.5,130,62,3,3,true,'Feeling good, calm day.')],
  badsleep:[day(7.4,125,64,4,3,true),day(7.0,120,66,4,3,true),day(6.6,110,68,5,3,true),
            day(6.2,100,70,5,3,false),day(5.8,90,72,6,2,false),day(5.5,80,74,6,2,false),
            day(5.2,70,76,7,2,false,'Very tired, can\'t sleep well.')],
  critical:[day(7.0,120,70,4,3,true),day(6.5,110,75,5,3,true),day(6.0,100,80,6,3,false),
            day(5.5,80,85,7,2,false),day(5.0,60,92,8,2,false),day(4.5,40,100,8,1,false),
            day(4.0,30,118,9,1,false,'Blurry vision and chest pain.')]
};
let S = { days: JSON.parse(JSON.stringify(scenarios.normal)), xp: 0 };

try{ const saved = localStorage.getItem('spacex-demo'); if(saved) S = JSON.parse(saved); }catch(e){}
const persist = () => { try{ localStorage.setItem('spacex-demo', JSON.stringify(S)); }catch(e){} };

/* =========================================================
   4. ANALYSIS – overall status + early trend detection
   ========================================================= */
function analyse(){
  const d = S.days[6], msgs = [];
  let overall = 0;
  indicators.forEach(i=>{
    const s = i.st(d);
    overall = Math.max(overall,s);
    if(s>0) msgs.push([s, i.name+' is '+(s==2?'in the red zone':'outside the normal range')+' ('+i.val(d)+')']);
  });
  // diary keywords
  const t = d.diary.toLowerCase();
  if(diaryRed.some(w=>t.includes(w))){ overall = 2; msgs.push([2,'Diary has a serious symptom – contact doctors on Earth']); }
  else if(diaryYel.some(w=>t.includes(w))){ overall = Math.max(overall,1); msgs.push([1,'Diary shows signs of tiredness or stress']); }
  // trend 1: sleep under 7h for several days in a row
  let run = 0;
  for(let i=6;i>=0 && S.days[i].sleep<7;i--) run++;
  if(run>=3){ overall = Math.max(overall,1); msgs.push([1,'Bad sleep for '+run+' days in a row']); }
  // trend 2: sleep is falling, even if today is still normal
  const avg = (a,b)=>S.days.slice(a,b).reduce((s,x)=>s+x.sleep,0)/(b-a);
  if(avg(4,7) < avg(1,4)-0.7){ overall = Math.max(overall,1); msgs.push([1,'Early warning: sleep trend is going down']); }
  // several indicators worse together
  const bad = indicators.filter(i=>i.st(d)>0).length;
  if(bad>=3){ overall = Math.max(overall,1); msgs.push([1,'Several indicators are getting worse together']); }
  if(!msgs.length) msgs.push([0,'All indicators are in the normal range']);
  return {overall, msgs};
}

/* =========================================================
   5. GAMIFICATION
   ========================================================= */
const challenges = [
  {text:'Sleep 7 hours or more',      ok:d=>d.sleep>=7},
  {text:'Exercise 120 minutes',       ok:d=>d.ex>=120},
  {text:'Write a diary entry',        ok:d=>d.diary.trim().length>0}
];
const achievements = [
  {name:'FIRST LOG',     ok:()=>S.xp>0},
  {name:'SLEEP MASTER',  ok:()=>S.days.slice(-3).every(d=>d.sleep>=7)},
  {name:'IRON BONES',    ok:()=>S.days.slice(-3).every(d=>d.ex>=120)},
  {name:'DIARY KEEPER',  ok:()=>S.days.filter(d=>d.diary.trim()).length>=1},
  {name:'ALL GREEN',     ok:()=>indicators.every(i=>i.st(S.days[6])==0)}
];

/* =========================================================
   6. RENDER
   ========================================================= */
function render(){
  const d = S.days[6], {overall, msgs} = analyse();
  // traffic light
  ['lg','ly','lr'].forEach((id,i)=>document.getElementById(id).classList.toggle('on', i==overall));
  const title = document.getElementById('statusTitle');
  title.textContent = stateNames[overall]; title.className = 'big '+stateClass[overall];
  document.getElementById('messages').innerHTML =
    msgs.sort((a,b)=>b[0]-a[0]).map(m=>'<li class="'+stateClass[m[0]]+'">'+m[1]+'</li>').join('');
  // indicator cards
  document.getElementById('cards').innerHTML = indicators.map(i=>{
    const s = i.st(d);
    return '<div class="card s'+s+'"><b>'+i.name+'</b><span class="'+stateClass[s]+'">'+i.val(d)+'</span></div>';
  }).join('');
  // form values
  fSleep.value=d.sleep; fEx.value=d.ex; fHr.value=d.hr; fMeals.value=d.meals;
  fVit.checked=d.vit; fStress.value=d.stress; fDiary.value=d.diary; stressVal.textContent=d.stress;
  // XP / level
  lvl.textContent = Math.floor(S.xp/100)+1; xp.textContent = S.xp;
  xpfill.style.width = (S.xp%100)+'%';
  document.getElementById('challenges').innerHTML =
    challenges.map(c=>'<li class="'+(c.ok(d)?'G':'')+'">['+(c.ok(d)?'X':' ')+'] '+c.text+'</li>').join('');
  document.getElementById('achs').innerHTML =
    achievements.map(a=>'<span class="ach '+(a.ok()?'on':'')+'">'+a.name+'</span>').join('');
  drawChart();
}

// pixel bar chart of sleep (last 7 days)
function drawChart(){
  const c = document.getElementById('chart'), ctx = c.getContext('2d');
  ctx.clearRect(0,0,320,160);
  const colors = ['#3ddc84','#ffd23f','#ff4d5e'], maxH = 10, base = 140, barW = 32;
  S.days.forEach((d,i)=>{
    const h = Math.round(d.sleep/maxH*120);
    ctx.fillStyle = colors[rules.sleep(d.sleep)];
    ctx.fillRect(14+i*44, base-h, barW, h);
    ctx.fillStyle = '#8a8ec4'; ctx.font = '8px monospace';
    ctx.fillText(i==6?'NOW':'D-'+(6-i), 14+i*44, 154);
  });
  ctx.fillStyle = '#fff';                         // 7 hour goal line (dashed, pixel style)
  const y = base - Math.round(7/maxH*120);
  for(let x=0;x<320;x+=8) ctx.fillRect(x,y,4,2);
}

/* =========================================================
   7. EVENTS
   ========================================================= */
fStress.addEventListener('input',()=>stressVal.textContent=fStress.value);

saveBtn.addEventListener('click',()=>{
  const before = S.days[6];
  const d = S.days[6] = day(+fSleep.value, +fEx.value, +fHr.value, +fStress.value,
                            +fMeals.value, fVit.checked, fDiary.value);
  // XP: +10 per green indicator, +25 for a diary entry, +50 if everything is green
  const greens = indicators.filter(i=>i.st(d)==0).length;
  S.xp += greens*10 + (d.diary.trim() ? 25 : 0) + (greens==indicators.length ? 50 : 0);
  persist(); render();
});

document.querySelectorAll('[data-sc]').forEach(b=>b.addEventListener('click',()=>{
  S.days = JSON.parse(JSON.stringify(scenarios[b.dataset.sc])); persist(); render();
}));

resetBtn.addEventListener('click',()=>{
  S = { days: JSON.parse(JSON.stringify(scenarios.normal)), xp: 0 }; persist(); render();
});

drawLogo();
render();
