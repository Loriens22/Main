/* The browser UI is intentionally small. Godot owns all gameplay and world state. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const elements = Object.fromEntries(['speed','speed-hint','speed-bar','coins','streak','destination','distance','origin','target','route-fill','route-tram','comfort-fill','comfort-value','passengers','condition','condition-text','view-label','intro','intro-footer','drive-controls','drive-hint','station-controls','station-caption','doors-button','doors-label','boarding-track','boarding-fill','bottom-instruction','workshop-panel','workshop-button','workshop-progress','upgrade-label','upgrade-track','upgrade-fill','return-button','arrival','subtitle','subtitle-text'].map(id => [id,$(id)]));
  let state = {mode:'loading', speed:0, wind:0};
  let subtitleTimer, arrivalTimer;
  let soundOn = localStorage.getItem('saltlight-sound') !== 'off';
  const dialog = $('help-dialog');
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
      this.nextClick=0;this.nextMusic=c.currentTime+.5;this.note=0;
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
      this.master.gain.setTargetAtTime(soundOn&&!document.hidden?.45:0,t,.15);
      this.wind.gain.setTargetAtTime(.023+(state.wind||0)*.025+speed*.001,t,.4);
      this.motor.frequency.setTargetAtTime(48+speed*1.35,t,.3);
      this.motorGain.gain.setTargetAtTime(Math.min(.07,speed*.0018),t,.3);
      if(speed>2&&t>this.nextClick){this.tone(145+Math.random()*35,t,.045,.035,'triangle');this.tone(100,t+.035,.035,.021,'triangle');this.nextClick=t+Math.max(.13,2.8/speed);}
      if(t>this.nextMusic){const n=this.note++%this.notes.length;this.tone(this.notes[n],t,2.5,.028,'triangle');this.tone(this.notes[n]/2,t,3.2,.018);if(n%4===0)this.tone(130.81,t,4,.02);this.nextMusic=t+(.72+(n%3===0?.36:0));}
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
  function openHelp() {releaseControls();if(!dialog.open)dialog.showModal();command('pause',true);}
  function closeHelp() {if(dialog.open)dialog.close();command('pause',false);}
  $('help-button').addEventListener('click',openHelp);
  $('close-help').addEventListener('click',closeHelp);
  $('resume-button').addEventListener('click',closeHelp);
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
    if(dialog.open){if(e.code==='Escape'){e.preventDefault();closeHelp();}return;}
    const codes=['KeyW','KeyS','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyA','KeyD','Space','KeyC','KeyR','KeyP','Escape','Digit1','Digit2'];
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
    subtitleTimer=setTimeout(()=>elements.subtitle.classList.remove('visible'),kind==='notice'?6500:5200);
  }
  window.saltlightEvent = (type,data) => {
    if(type==='ready') {
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
  };
  window.saltlightState = data => {
    state=data;window.saltlightSnapshot=data;
    document.body.dataset.mode=data.mode;
    if(data.paused&&!dialog.open)dialog.showModal();
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
    text('view-label',['Chase view','Window view','Scenic view'][data.view]);
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
