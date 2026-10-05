/* The browser UI is intentionally small. Godot owns all gameplay and world state. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const elements = Object.fromEntries(['speed','speed-hint','speed-bar','coins','streak','destination','distance','origin','target','route-fill','route-tram','comfort-fill','comfort-value','passengers','condition','condition-text','view-label','intro','intro-footer','drive-controls','drive-hint','station-controls','station-caption','doors-button','doors-label','boarding-track','boarding-fill','bottom-instruction','workshop-panel','workshop-button','workshop-progress','upgrade-label','upgrade-track','upgrade-fill','return-button','arrival','subtitle','subtitle-text'].map(id => [id,$(id)]));
  let state = {mode:'loading', speed:0, wind:0};
  let subtitleTimer, arrivalTimer;
  let soundOn = localStorage.getItem('saltlight-sound') !== 'off';
  let graphics=localStorage.getItem('saltlight-graphics')||'auto';
  const dialog = $('help-dialog');
  const journal = $('journal-dialog');
  const stops = [
    {name:'Saltlight Terminus',tag:'The lighthouse quarter',resident:'Ada · Postmistress',icon:'lighthouse',color:'#b9c9b3',description:'Salt-worn steps and narrow streets. Lanterns glow behind blue shutters; Ada waits with the last evening letters.'},
    {name:'Mango Tide',tag:'The hanging harbour',resident:'Luca · Fruit seller',icon:'harbour',color:'#e9b684',description:'Red-tiled terraces, a noisy little market and skiffs moored above the clouds. Luca has mangoes for the next village.'},
    {name:'Fernbell',tag:'The mushroom village',resident:'Mira · Spore keeper',icon:'mushroom',color:'#bec797',description:'Homes grow around ancient mushroom stems. Their gills light the fern paths, while fireflies drift under the Bellcap Inn.'},
    {name:'Lantern Hollow',tag:'The harvest festival',resident:'Pip · Lantern maker',icon:'pumpkin',color:'#e4ad72',description:'Pumpkin cottages and a harvest fair beneath copper leaves. The jack lanterns smile. Every one holds a neighbour’s wish.'},
    {name:'Tideglass Observatory',tag:'The garden of small moons',resident:'Iris · Astronomer',icon:'stars',color:'#a7c6c7',description:'A copper dome above a waterfall. Windmills turn slowly around a garden of brass orbits, and Iris measures the moon.'}
  ];
  const drawings = {
    lighthouse:'<path d="M28 58h24l-4-32H32Zm4-32h16v-9H32Zm-3-9h22L40 8Zm4 20h14M32 46h16M37 18v8m6-8v8M10 31l15-4m30 0 15 4M36 58V47h8v11"/>',
    harbour:'<path d="M14 50q26 18 52 0l-8 13H23ZM40 13v36M43 15v27h20ZM36 24v19H20ZM9 68q7-5 14 0t14 0t14 0t14 0M13 55V32h5v25"/>',
    mushroom:'<path d="M10 39q0-25 30-27t30 27q-30 12-60 0ZM32 44l-3 20q11 9 22 0l-3-20M35 66V54h10v12M23 27h1m17-6h1m16 10h1M20 43l5 5m10-4 1 5m11-5-1 5m12-6-4 5"/>',
    pumpkin:'<path d="M40 24q-12-12-26 3t1 33q12 10 25 4 13 6 25-4t1-33q-14-15-26-3ZM40 24q-17 13 0 40m0-40q17 13 0 40M37 21l4-10 8-1M24 39l6-7 6 7Zm20 0 6-7 6 7ZM26 49q14 13 28 0"/>',
    stars:'<path d="M15 54h50V40H15ZM13 40q2-27 27-27t27 27M32 14q-6 10-6 24m25-23q6 9 6 21M41 35l16-20 8 6-15 21ZM36 54V44h8v10M13 66h54M8 18l2-4 2 4 4 2-4 2-2 4-2-4-4-2ZM65 8l1-3 1 3 3 1-3 1-1 3-1-3-3-1Z"/>'
  };
  $('journal-stops').innerHTML=stops.map((stop,i)=>`<article class="journal-stop" style="--stop-color:${stop.color}"><div class="stop-art"><svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${drawings[stop.icon]}</svg><span class="station-stamp" id="stamp-${i}">UNVISITED</span></div><div class="stop-notes"><span class="eyebrow">${String(i+1).padStart(2,'0')} · ${stop.tag}</span><h3>${stop.name}</h3><p>${stop.description}</p><span class="resident-name">${stop.resident}</span><button class="preview-button" id="preview-${i}">Take a look <span aria-hidden="true">↗</span></button></div></article>`).join('');
  const held = new Set();
  for (let i=0;i<20;i++) elements['speed-bar'].appendChild(document.createElement('i'));
  const bars = [...elements['speed-bar'].children];
  const command = (action,value=true) => {
    if (typeof window.saltlightCommand === 'function') window.saltlightCommand(JSON.stringify({action,value}));
  };
  const text = (id,value) => { if(elements[id].textContent !== String(value)) elements[id].textContent=String(value); };
  const hide = (id,value) => { elements[id].hidden=value; };

  // A gentle, original pentatonic score, track joints, motor hum, wind, and station bells.
  class Soundscape {
    init() {
      if(this.context) {this.context.resume();return;}
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if(!AudioContext) return;
      this.context = new AudioContext();
      const c=this.context;
      this.master=c.createGain();this.master.gain.value=soundOn?.45:0;this.master.connect(c.destination);
      const buffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
      const channel=buffer.getChannelData(0);
      let last=0;
      for(let i=0;i<channel.length;i++){last=(last+(Math.random()*2-1)*.025)/1.02;channel[i]=last*3;}
      const noise=c.createBufferSource();noise.buffer=buffer;noise.loop=true;
      const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=850;
      this.wind=c.createGain();this.wind.gain.value=.028;
      noise.connect(filter);filter.connect(this.wind);this.wind.connect(this.master);noise.start();
      this.motor=c.createOscillator();this.motor.type='sine';this.motor.frequency.value=58;
      this.motorGain=c.createGain();this.motorGain.gain.value=0;
      this.motor.connect(this.motorGain);this.motorGain.connect(this.master);this.motor.start();
      this.nextClick=0;this.nextMusic=c.currentTime+.5;this.nextAmbient=c.currentTime+4;this.note=0;
      this.notes=[261.63,329.63,392,440,392,329.63,293.66,329.63,196,261.63,293.66,329.63,392,329.63,261.63,196];
      this.timer=setInterval(()=>this.update(),90);
    }
    tone(freq,time,duration,gain=.035,type='sine') {
      if(!this.context)return;
      const c=this.context,o=c.createOscillator(),g=c.createGain();
      o.type=type;o.frequency.value=freq;
      g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(gain,time+.012);
      g.gain.exponentialRampToValueAtTime(.0001,time+duration);
      o.connect(g);g.connect(this.master);o.start(time);o.stop(time+duration+.05);
    }
    bell() {
      if(!this.context)return;
      const t=this.context.currentTime;
      this.tone(783.99,t,1.8,.1);this.tone(1174.66,t+.09,1.5,.045);this.tone(659.25,t+.34,1.8,.055);
    }
    update() {
      const c=this.context;if(!c)return;const t=c.currentTime;
      const driving=state.mode==='drive'&&!state.paused;
      const speed=driving?state.speed:0;
      const place=state.previewStation>=0?state.previewStation:state.stationIndex||0;
      this.master.gain.setTargetAtTime(soundOn&&!document.hidden?.45:0,t,.15);
      this.wind.gain.setTargetAtTime(.023+(state.wind||0)*.025+speed*.001,t,.4);
      this.motor.frequency.setTargetAtTime(48+speed*1.35,t,.3);
      this.motorGain.gain.setTargetAtTime(Math.min(.07,speed*.0018),t,.3);
      if(speed>2&&t>this.nextClick){this.tone(145+Math.random()*35,t,.045,.035,'triangle');this.tone(100,t+.035,.035,.021,'triangle');this.nextClick=t+Math.max(.13,2.8/speed);}
      if(t>this.nextMusic){const n=this.note++%this.notes.length;const register=place===4?2:1;this.tone(this.notes[n]*register,t,2.5,place===4?.018:.028,place===4?'sine':'triangle');this.tone(this.notes[n]/2,t,3.2,.018);if(n%4===0)this.tone(130.81,t,4,.02);this.nextMusic=t+(.72+(n%3===0?.36:0));}
      // Small location-specific details: woodland chimes, festival bells, celestial glass.
      if(t>this.nextAmbient){
        if(place===2){const freq=[880,1174.66,1318.51][Math.floor(Math.random()*3)];this.tone(freq,t,2.8,.009);this.tone(freq*1.5,t+.12,1.6,.004);}
        if(place===3)this.tone(523.25,t,2.2,.010,'triangle');
        if(place===4){this.tone(1567.98,t,3.2,.008);this.tone(2093,t+.25,2.1,.005);}
        this.nextAmbient=t+6+Math.random()*6;
      }
    }
  }
  const audio=new Soundscape();
  function updateSoundButton() {
    $('sound-icon').setAttribute('href',soundOn?'icons.svg#sound':'icons.svg#mute');
    $('sound-button').setAttribute('aria-label',soundOn?'Mute sound':'Enable sound');
    $('sound-button').setAttribute('aria-pressed',String(soundOn));
    $('sound-button').title=soundOn?'Sound on':'Sound off';
  }
  updateSoundButton();
  $('graphics-select').value=graphics;
  $('graphics-select').addEventListener('change',()=>{graphics=$('graphics-select').value;localStorage.setItem('saltlight-graphics',graphics);command('graphics',graphics);});
  function start() {audio.init();command('start');}
  $('start-button').addEventListener('click',start);
  $('sound-button').addEventListener('click',()=>{soundOn=!soundOn;localStorage.setItem('saltlight-sound',soundOn?'on':'off');audio.init();updateSoundButton();});
  $('workshop-button').addEventListener('click',()=>{audio.init();command('workshop');});
  $('return-button').addEventListener('click',()=>command('return'));
  $('view-button').addEventListener('click',()=>command('view'));
  $('doors-button').addEventListener('click',()=>{hide('arrival',true);command('doors');});
  for(const part of ['hearth','companion']) $(part+'-button').addEventListener('click',()=>command('upgrade',part));
  $('fullscreen-button').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.();});

  function releaseControls() {
    held.clear();command('power',false);command('brake',false);command('look',0);
    $('power-button').classList.remove('active');$('brake-button').classList.remove('active');
  }
  function openHelp() {releaseControls();if(journal.open)journal.close();if(!dialog.open)dialog.showModal();command('pause',true);}
  function closeHelp() {if(dialog.open)dialog.close();command('pause',false);}
  $('help-button').addEventListener('click',openHelp);
  $('close-help').addEventListener('click',closeHelp);
  $('resume-button').addEventListener('click',closeHelp);
  function openJournal(){releaseControls();audio.init();if(dialog.open)dialog.close();if(!journal.open)journal.showModal();command('pause',true);}
  function closeJournal(){if(journal.open)journal.close();command('preview_clear');command('pause',false);}
  $('journal-button').addEventListener('click',openJournal);
  $('close-journal').addEventListener('click',closeJournal);
  $('journal-return').addEventListener('click',closeJournal);
  for(let i=0;i<stops.length;i++)$('preview-'+i).addEventListener('click',()=>{journal.close();document.body.dataset.preview='true';$('preview-info').hidden=false;$('preview-tag').textContent=stops[i].tag;$('preview-name').textContent=stops[i].name;$('preview-description').textContent=stops[i].description;command('preview',i);});
  $('preview-back').addEventListener('click',()=>{document.body.dataset.preview='false';$('preview-info').hidden=true;command('preview_clear');journal.showModal();});
  journal.addEventListener('cancel',e=>{e.preventDefault();closeJournal();});
  journal.addEventListener('click',e=>{if(e.target===journal){const r=journal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeJournal();}});
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeHelp();}});
  $('restart-button').addEventListener('click',()=>{closeHelp();hide('arrival',true);command('reset');});

  for(const action of ['power','brake']) {
    const button=$(action+'-button');
    button.addEventListener('pointerdown',e=>{e.preventDefault();audio.init();button.setPointerCapture(e.pointerId);button.classList.add('active');command(action,true);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{button.classList.remove('active');command(action,false);});
    button.addEventListener('contextmenu',e=>e.preventDefault());
  }
  document.addEventListener('keydown',e=>{
    if(state.mode==='loading')return;
    if(document.body.dataset.preview==='true'){if(e.code==='Escape'||e.code==='KeyJ'){e.preventDefault();$('preview-back').click();}return;}
    if(journal.open){if(e.code==='Escape'||e.code==='KeyJ'){e.preventDefault();closeJournal();}return;}
    if(dialog.open){if(e.code==='Escape'){e.preventDefault();closeHelp();}return;}
    const codes=['KeyW','KeyS','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyA','KeyD','Space','KeyC','KeyR','KeyP','KeyJ','Escape','Digit1','Digit2'];
    if(!codes.includes(e.code)&&!(e.code==='Enter'&&state.mode==='intro'))return;
    e.preventDefault();e.stopPropagation();if(e.repeat)return;audio.init();held.add(e.code);
    if(e.code==='Enter'){start();return;}
    if(['KeyW','ArrowUp'].includes(e.code)){$('power-button').classList.add('active');command('power',true);}
    if(['KeyS','ArrowDown'].includes(e.code)){$('brake-button').classList.add('active');command('brake',true);}
    if(['ArrowLeft','KeyA'].includes(e.code))command('look',-1);
    if(['ArrowRight','KeyD'].includes(e.code))command('look',1);
    if(e.code==='Space'){hide('arrival',true);command('doors');}
    if(e.code==='KeyC')command('view');
    if(e.code==='KeyR')command(['workshop','upgrading','exitshop'].includes(state.mode)?'return':'workshop');
    if(e.code==='KeyP'||e.code==='Escape')openHelp();
    if(e.code==='KeyJ')openJournal();
    if(e.code==='Digit1')command('upgrade','hearth');
    if(e.code==='Digit2')command('upgrade','companion');
  },true);
  document.addEventListener('keyup',e=>{
    held.delete(e.code);
    if(['KeyW','ArrowUp'].includes(e.code)&&!held.has('KeyW')&&!held.has('ArrowUp')){$('power-button').classList.remove('active');command('power',false);}
    if(['KeyS','ArrowDown'].includes(e.code)&&!held.has('KeyS')&&!held.has('ArrowDown')){$('brake-button').classList.remove('active');command('brake',false);}
    if(['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code))command('look',0);
  },true);
  window.addEventListener('blur',releaseControls);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseControls();if(!['loading','intro'].includes(state.mode))command('pause',true);}});

  function showSubtitle(message,kind) {
    clearTimeout(subtitleTimer);
    text('subtitle-text',message);
    elements.subtitle.classList.toggle('notice',kind==='notice');
    elements.subtitle.classList.add('visible');
    subtitleTimer=setTimeout(()=>elements.subtitle.classList.remove('visible'),kind==='story'?11000:kind==='notice'?6500:5200);
  }
  window.saltlightEvent = (type,data) => {
    if(type==='ready') {
      command('graphics',graphics);
      $('load-fill').style.width='100%';$('ui').hidden=false;$('loading').classList.add('done');
      setTimeout(()=>$('loading').hidden=true,550);
    }
    if(type==='subtitle'&&(data.kind!=='arrival'||elements.arrival.hidden))showSubtitle(data.text,data.kind);
    if(type==='arrival') {
      clearTimeout(arrivalTimer);elements.subtitle.classList.remove('visible');
      $('arrival-station').textContent=data.station;
      $('arrival-caption').textContent=data.smooth?'A SMOOTH ARRIVAL':'WELCOME TO THE PLATFORM';
      $('arrival-reward').textContent='+'+data.reward;
      hide('arrival',false);audio.bell();arrivalTimer=setTimeout(()=>hide('arrival',true),5500);
    }
    if(type==='bell'||type==='upgrade_done')audio.bell();
    if(type==='album_complete'){showSubtitle(data.text,'story');audio.bell();}
  };
  window.saltlightState = data => {
    state=data;window.saltlightSnapshot=data;
    document.body.dataset.mode=data.mode;
    if(data.paused&&!dialog.open&&!journal.open&&document.body.dataset.preview!=='true')dialog.showModal();
    if(!data.paused&&dialog.open)dialog.close();
    hide('intro',data.mode!=='intro');hide('intro-footer',data.mode!=='intro');
    text('coins',data.coins);text('streak','×'+data.streak);
    text('destination',data.destination);text('origin',data.origin);text('target',data.destination);
    text('distance',Math.ceil(data.remaining)+' m away');
    text('speed',String(Math.round(data.speed)).padStart(2,'0'));
    text('speed-hint',data.speed<2?'A gentle start':data.speed>34?'Ease off a little':data.condition==='Crosswind'?'A light hand in the wind':'Finding your rhythm');
    bars.forEach((bar,i)=>bar.classList.toggle('active',i<Math.round(data.speed/48*20)));
    elements['route-fill'].style.width=data.progress*100+'%';elements['route-tram'].style.left=data.progress*100+'%';
    elements['comfort-fill'].style.width=data.comfort+'%';elements['comfort-fill'].style.background=data.comfort<55?'#e2a77c':'#d9dda5';
    text('comfort-value',Math.round(data.comfort)+'%');
    elements.passengers.innerHTML=data.passengers+'<span>/16</span>';
    text('condition-text',data.condition);elements.condition.classList.toggle('crosswind',data.condition==='Crosswind');
    text('view-label',['Chase view','Window view','Scenic view',['docked','boarding'].includes(data.mode)?'Village panorama':'Driver’s view'][data.view]);
    const visited=data.visited||[true,false,false,false,false];
    $('album-count').textContent=visited.filter(Boolean).length+' of 5 stamps collected';
    $('album-reward').textContent=data.completedAlbum?'Coastal album complete ✓':'Complete the album · +100';
    visited.forEach((collected,i)=>{const stamp=$('stamp-'+i);stamp.textContent=collected?'COASTAL LINE ✓':'UNVISITED';stamp.classList.toggle('collected',collected);});
    elements['workshop-button'].classList.toggle('unavailable',!data.canWorkshop);
    const shop=['workshop','upgrading','exitshop'].includes(data.mode);
    hide('workshop-panel',!shop);
    const station=['docked','boarding'].includes(data.mode);
    hide('drive-controls',station);hide('station-controls',!station);hide('drive-hint',station);
    $('power-button').disabled=data.mode!=='drive';$('brake-button').disabled=data.mode!=='drive';
    if(station) {
      const boarding=data.mode==='boarding'&&data.boardingTime<5.4;
      text('station-caption',data.station);
      text('doors-label',boarding?'Please wait…':data.servicePending?'Open doors':'All aboard');
      elements['doors-button'].disabled=boarding;
      hide('boarding-track',!boarding);elements['boarding-fill'].style.width=Math.min(100,data.boardingTime/5.4*100)+'%';
      text('bottom-instruction',boarding?'YOUR NEIGHBOURS ARE BOARDING':'SPACE TO '+(data.servicePending?'OPEN DOORS':'DEPART'));
    } else text('bottom-instruction','HOLD TO DRIVE · RELEASE TO COAST');
    text('drive-hint',data.remaining<60?'Platform ahead. Brake gently.':data.condition==='Crosswind'?'A sea breeze. Keep a light hand.':Math.abs(data.lateral)>2.4?'Let the curve set the pace.':'Find your rhythm. Let the line carry you.');
    if(shop) {
      for(const part of ['hearth','companion']) {
        const fitted=data.upgrades[part],price=part==='hearth'?50:75;
        $(part+'-button').disabled=fitted||data.mode!=='workshop'||data.coins<price;
        $(part+'-button').classList.toggle('installed',fitted);
        $(part+'-price').innerHTML=fitted?'Fitted ✓':price+'<svg viewBox="0 0 24 24"><use href="icons.svg#coin"/></svg>';
      }
      const fitting=data.mode==='upgrading';
      hide('workshop-progress',!fitting);elements['return-button'].disabled=data.mode!=='workshop';
      text('upgrade-label',data.upgrade==='hearth'?'Hearth leaves — Lifting the old part':'Little Companion — Preparing the tram');
      elements['upgrade-fill'].style.width=data.upgradeProgress*100+'%';elements['upgrade-track'].setAttribute('aria-valuenow',Math.round(data.upgradeProgress*100));
    }
  };
  window.saltlightLoadProgress = (current,total) => {if(total>0)$('load-fill').style.width=Math.max(5,current/total*95)+'%';};
  window.saltlightLoadError = message => {$('loading-text').textContent=message;$('retry').hidden=false;$('load-fill').style.width='0%';};
  $('retry').addEventListener('click',()=>location.reload());
})();
