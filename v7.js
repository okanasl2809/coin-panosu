/* Kripto Alarm Sistemi v7 — JavaScript hesap motoru
   Pine kaynağı: "Kripto Alarm Sistemi v7" (TradingView). Tüm hesaplar KAPANMIŞ mumlarla yapılır.
   Hem tarayıcıdaki pano hem de bulut alarmı (GitHub Actions) bu dosyayı kullanır.
   Mum biçimi: {t: açılış ms, o, h, l, c, v, ct: kapanış ms} */
(function(root){
"use strict";
const HOUR=3600000, DAY=86400000;
/* ---------- göstergeler (TradingView ile aynı tanımlar) ---------- */
function sma(a,n){ const o=new Array(a.length).fill(null); let s=0; for(let i=0;i<a.length;i++){ s+=a[i]; if(i>=n) s-=a[i-n]; if(i>=n-1) o[i]=s/n; } return o; }
function ema(a,n){ const o=new Array(a.length).fill(null), k=2/(n+1); let p=null; for(let i=0;i<a.length;i++){ if(i<n-1) continue; if(p==null){ let s=0; for(let j=i-n+1;j<=i;j++) s+=a[j]; p=s/n; } else p=a[i]*k+p*(1-k); o[i]=p; } return o; }
function rma(a,n){ const o=new Array(a.length).fill(null); let p=null; for(let i=0;i<a.length;i++){ if(a[i]==null || i<n-1) continue; if(p==null){ let s=0,ok=true; for(let j=i-n+1;j<=i;j++){ if(a[j]==null){ok=false;break;} s+=a[j]; } if(!ok) continue; p=s/n; } else p=(p*(n-1)+a[i])/n; o[i]=p; } return o; }
function trueRange(H,L,C){ return H.map((h,i)=> i===0 ? h-L[i] : Math.max(h-L[i], Math.abs(h-C[i-1]), Math.abs(L[i]-C[i-1]))); }
function atr(H,L,C,n){ return rma(trueRange(H,L,C),n); }
function supertrend(H,L,C,n,mult){
  // Pine ta.supertrend başvuru kodu. trend: 1 = yukarı, -1 = aşağı
  const A=atr(H,L,C,n), N=C.length, up=new Array(N).fill(null), dn=new Array(N).fill(null), tr=new Array(N).fill(null), st=new Array(N).fill(null);
  for(let i=0;i<N;i++){
    if(A[i]==null) continue;
    const src=(H[i]+L[i])/2; let u=src-mult*A[i], d=src+mult*A[i];
    const pu=up[i-1]==null?0:up[i-1], pd=dn[i-1]==null?0:dn[i-1];
    if(i>0){ u=(u>pu || C[i-1]<pu)?u:pu; d=(d<pd || C[i-1]>pd)?d:pd; }
    let t; if(i===0 || A[i-1]==null) t=-1; else if(st[i-1]===dn[i-1]) t=C[i]>d?1:-1; else t=C[i]<u?-1:1;
    up[i]=u; dn[i]=d; tr[i]=t; st[i]=t===1?u:d;
  }
  return {st, trend:tr};
}
function rsi(C,n){ const g=[null], l=[null]; for(let i=1;i<C.length;i++){ g.push(Math.max(C[i]-C[i-1],0)); l.push(Math.max(C[i-1]-C[i],0)); } const ag=rma(g.slice(1),n), al=rma(l.slice(1),n); return [null].concat(ag.map((v,i)=>v==null||al[i]==null?null: al[i]===0?100:100-100/(1+v/al[i]))); }
function dmi(H,L,C,n){
  const pdm=H.map((h,i)=>{ if(!i) return 0; const u=h-H[i-1], d=L[i-1]-L[i]; return u>d&&u>0?u:0; }), mdm=H.map((h,i)=>{ if(!i) return 0; const u=h-H[i-1], d=L[i-1]-L[i]; return d>u&&d>0?d:0; });
  const T=atr(H,L,C,n), p=rma(pdm,n), m=rma(mdm,n);
  const dp=T.map((t,i)=>t&&p[i]!=null?100*p[i]/t:null), dm=T.map((t,i)=>t&&m[i]!=null?100*m[i]/t:null);
  const dx=dp.map((v,i)=>v==null||dm[i]==null?null:100*Math.abs(v-dm[i])/((v+dm[i])===0?1:(v+dm[i])));
  const f=dx.findIndex(v=>v!=null), adx=new Array(C.length).fill(null); if(f>=0) rma(dx.slice(f),n).forEach((v,i)=>adx[f+i]=v);
  return {dp,dm,adx};
}
function stdev(a,n){ const o=new Array(a.length).fill(null); for(let i=n-1;i<a.length;i++){ let s=0; for(let j=i-n+1;j<=i;j++) s+=a[j]; const mu=s/n; let v=0; for(let j=i-n+1;j<=i;j++) v+=(a[j]-mu)**2; o[i]=Math.sqrt(v/n); } return o; }
function hh(a,n,i){ let r=-Infinity; for(let j=Math.max(0,i-n+1);j<=i;j++) if(a[j]>r) r=a[j]; return r; }
function ll(a,n,i){ let r=Infinity; for(let j=Math.max(0,i-n+1);j<=i;j++) if(a[j]<r) r=a[j]; return r; }
function linreg(y,n,i){ if(i<n-1) return null; let sx=0,sy=0,sxy=0,sxx=0; for(let k=0;k<n;k++){ const v=y[i-n+1+k]; if(v==null) return null; sx+=k; sy+=v; sxy+=k*v; sxx+=k*k; } const b=(n*sxy-sx*sy)/(n*sxx-sx*sx); return (sy-b*sx)/n + b*(n-1); }
function pnr(a,len,i,pct){ if(i<len-1) return null; const w=a.slice(i-len+1,i+1).sort((x,y)=>x-y); return w[Math.max(0,Math.ceil(pct/100*len)-1)]; }
function percentrank(a,len,i){ if(i<len || a[i]==null) return null; let c=0; for(let k=i-len;k<i;k++) if(a[k]!=null && a[k]<=a[i]) c++; return c/len*100; }
function cols(B){ return {O:B.map(b=>b.o), H:B.map(b=>b.h), L:B.map(b=>b.l), C:B.map(b=>b.c), V:B.map(b=>b.v)}; }

/* ---------- BTC rejimi ----------
   Gün içi grafik: BTC günlük kapanış > EMA50 (bir önceki tamamlanmış gün).
   Günlük ve üstü: BTC haftalık kapanış > EMA20 (bir önceki tamamlanmış hafta). */
function regimeSeries(btcBars, len){
  if(!btcBars || !btcBars.length) return null;
  const C=btcBars.map(b=>b.c), E=ema(C,len);
  return {t:btcBars.map(b=>b.t), ct:btcBars.map(b=>b.ct), ok:C.map((c,i)=>E[i]==null?null:c>E[i])};
}
function regimeAt(R, t){ // t anında açılan mum için: t'den ÖNCE kapanmış son BTC periyodunun değeri
  if(!R) return null; let lo=0, hi=R.ct.length-1, j=-1;
  while(lo<=hi){ const m=(lo+hi)>>1; if(R.ct[m]<t){ j=m; lo=m+1; } else hi=m-1; }
  return j<0 ? null : R.ok[j];
}

/* ---------- TREND SİSTEMİ ---------- */
const DEF={ dIn:20, dOut:10, tAtrMult:3, warmup:202, useBtc:true, useE200:true, useAdx:false, adxMax:30, reqSq:false, reqObv:false,
  stLen:10, stMult:3, ladder:"1s+gunluk", L:[[2,0.5],[3,1],[5,2.5],[8,5]], useReEntry:true, reLen:10, reBars:30, reTrendLen:50,
  bbLen:20, bbMult:2, sqLookback:100, sqPct:10, sqWindow:10, useBox:true, boxWait:20, boxMaxAtr:4, boxRR:3,
  useBase:true, baseLen:30, basePct:30, baseVol:1.0, obvEmaLen:20, prd:10, rangeUpper:60, rangeLower:5, divWindow:20, riskPct:1, maxW:20 };
const NAMES={1:"TREND AL",2:"SIKIŞMALI TREND AL",3:"GÜÇLÜ TREND AL",4:"TEKRAR AL",5:"TREND SAT",6:"TREND STOP",7:"SIKIŞMA AÇILDI ↑",8:"SIKIŞMA AÇILDI ↓",9:"DAR TABAN KIRILIMI",10:"KUTU KIRILIMI AL",19:"KÂR KİLİTLENDİ",20:"KÂR KİLİDİ STOP",
  11:"4S ATEŞLEME",12:"GÜNLÜK ATEŞLEME",13:"HAZIRLIK",14:"GEÇ / KOVALAMA",15:"PUMP STOP"};
function ladderOn(tfSec, mode){ if(mode==="kapali") return false; if(mode==="tumu") return true; return tfSec<14400 || (tfSec>=86400 && tfSec<604800); }

/* bars: kapanmış mumlar; tfSec: saniye; btc: {d: günlük BTC mumları, w: haftalık}; o: ayarlar
   Dönüş: events (her mumdaki sinyal), trades (tamamlanan/açık işlemler), last (son mumdaki durum) */
function trend(bars, tfSec, btc, o){
  o=Object.assign({},DEF,o||{});
  const N=bars.length, {O,H,L,C,V}=cols(bars);
  const isM=tfSec>=2419200, isW=tfSec>=604800 && !isM, eLen=isM?12:isW?50:200, warmN=isM?24:isW?60:o.warmup;
  const ST=supertrend(H,L,C,o.stLen,o.stMult), A20=atr(H,L,C,20), A14=atr(H,L,C,14), E=ema(C,eLen), MA=sma(C,o.reTrendLen);
  const D=dmi(H,L,C,14), R=rsi(C,14), basis=sma(C,o.bbLen), sd=stdev(C,o.bbLen);
  const bbw=basis.map((b,i)=>b&&sd[i]!=null?(2*o.bbMult*sd[i])/b*100:null);
  const obv=[0]; for(let i=1;i<N;i++) obv.push(obv[i-1]+(C[i]>C[i-1]?V[i]:C[i]<C[i-1]?-V[i]:0));
  const obvE=ema(obv,o.obvEmaLen), vs3=sma(V,3), vs30=sma(V,30);
  const mid=C.map((c,i)=>basis[i]==null?null:((hh(H,o.bbLen,i)+ll(L,o.bbLen,i))/2+basis[i])/2), mY=C.map((c,i)=>mid[i]==null?null:c-mid[i]);
  const RD=btc? regimeSeries(btc.d,50):null, RW=btc? regimeSeries(btc.w,20):null, hiTF=tfSec>=86400;
  const ladOn=ladderOn(tfSec,o.ladder);
  let inT=false, tStop=null, curStop=null, hiSince=null, tEntry=null, tRisk=null, ladLvl=0, lastExitBar=null, lastExitPx=null, entryI=null, entryCode=null;
  let bxH=null, bxL=null, bxEnd=null, bxArm=false, lastSq=-1e9, lastBull=-1e9, prevPiv=null;
  const sqA=new Array(N).fill(false), events=[], trades=[];
  for(let i=0;i<N;i++){
    const rank=percentrank(bbw,o.sqLookback,i), squeeze=rank!=null && rank<o.sqPct; sqA[i]=squeeze;
    if(squeeze) lastSq=i;
    const sqFire = !squeeze && i>0 && sqA[i-1];
    const sqRecent = squeeze || (i-lastSq<=o.sqWindow);
    // OBV boğa uyumsuzluğu (pivot dip)
    let plFound=false;
    const pc=i-o.prd;
    if(pc>=o.prd){ let ok=true; for(let k=pc-o.prd;k<=i;k++){ if(k===pc) continue; if(k<pc ? obv[k]<=obv[pc] : obv[k]<obv[pc]){ ok=false; break; } } plFound=ok; }
    if(plFound){
      if(prevPiv){ const bs=i-1-prevPiv.i; if(obv[pc]>prevPiv.obv && bs>=o.rangeLower && bs<=o.rangeUpper && L[pc]<prevPiv.low) lastBull=i; }
      prevPiv={i, obv:obv[pc], low:L[pc]};
    }
    const obvUp=obv[i]>(obvE[i]==null?Infinity:obvE[i]), obvOk=obvUp || (i-lastBull<=o.divWindow);
    const mom=linreg(mY,o.bbLen,i), momP=linreg(mY,o.bbLen,i-1);
    const dir=(C[i]>basis[i]?1:-1)+(obvUp?1:-1)+(R[i]>50?1:-1)+(D.dp[i]>D.dm[i]?1:-1)+(mom!=null&&momP!=null&&mom>momP?1:-1);
    const upper=i>=o.dIn?hh(H,o.dIn,i-1):Infinity, upperRe=i>=o.reLen?hh(H,o.reLen,i-1):Infinity;
    const btcR = hiTF ? regimeAt(RW,bars[i].t) : regimeAt(RD,bars[i].t);
    const btcOk = !o.useBtc || btcR===true, eOk = !o.useE200 || (E[i]!=null && C[i]>E[i]), filtOk=btcOk && eOk;
    const adxOk = !o.useAdx || (D.adx[i]!=null && D.adx[i]<o.adxMax);
    if(squeeze){ bxH = i>0&&sqA[i-1] ? Math.max(bxH,H[i]) : H[i]; bxL = i>0&&sqA[i-1] ? Math.min(bxL,L[i]) : L[i]; bxArm=false; }
    if(sqFire){ bxEnd=i; bxArm=true; }
    let code=0, info=0, lk=0, pnl=null, sz=null, iStop=null, exitPx=null;
    if(inT){
      const stopHit=L[i]<=curStop, sell=ST.trend[i]===-1;
      if(stopHit){ exitPx=Math.min(O[i],curStop); code = ladLvl>0 && curStop>tStop ? 20 : 6; }
      else if(sell){ exitPx=C[i]; code=5; }
      if(code===5 || code===6 || code===20){
        pnl=(exitPx/tEntry-1)*100;
        trades.push({entryI, entryT:bars[entryI].ct, entry:tEntry, stop0:tStop, code:entryCode, exitI:i, exitT:bars[i].ct, exit:exitPx, exitCode:code, pnl, R:(exitPx-tEntry)/tRisk, lvl:ladLvl, bars:i-entryI});
        inT=false; lastExitBar=i; lastExitPx=exitPx;
      } else {
        if(sqFire) code = C[i]>basis[i] ? 7 : 8;
        hiSince=Math.max(hiSince,H[i]);
        if(ladOn && tRisk>0){ const gR=(hiSince-tEntry)/tRisk; let nl=0; o.L.forEach((x,k)=>{ if(gR>=x[0]) nl=k+1; });
          if(nl>ladLvl){ const ns=tEntry+o.L[nl-1][1]*tRisk; if(ns>curStop){ curStop=ns; lk=nl; } ladLvl=nl; } }
      }
    } else {
      const baseOk=i>warmN;
      const normBuy = baseOk && filtOk && C[i]>upper && adxOk && (!o.reqSq || sqRecent) && (!o.reqObv || obvOk);
      const reBuy = baseOk && filtOk && o.useReEntry && lastExitBar!=null && i-lastExitBar<=o.reBars && C[i]>upperRe && MA[i]!=null && C[i]>MA[i] && C[i]>lastExitPx;
      if((normBuy || reBuy) && A20[i]!=null){
        inT=true; tEntry=C[i]; tStop=C[i]-o.tAtrMult*A20[i]; curStop=tStop; hiSince=H[i]; ladLvl=0; tRisk=o.tAtrMult*A20[i]; entryI=i;
        sz=Math.min(o.riskPct/(tRisk/C[i]*100)*100, o.maxW);
        code = normBuy ? (sqRecent && obvOk ? 3 : sqRecent ? 2 : 1) : 4; entryCode=code;
      } else if(sqFire && tfSec>=14400) code = C[i]>basis[i] ? 7 : 8;
    }
    // bilgi sinyalleri
    if(o.useBase && tfSec>=86400 && i>=o.baseLen && vs30[i]){
      const bH=hh(H,o.baseLen,i-1), bL=ll(L,o.baseLen,i-1);
      if(C[i]>upper && (bH-bL)/C[i]*100<o.basePct && vs3[i]/vs30[i]>o.baseVol && filtOk && i>warmN && A14[i]!=null){ info=9; iStop=C[i]-2*A14[i]; }
    }
    if(o.useBox && bxArm && tfSec>=14400 && !squeeze){
      if(i-bxEnd>o.boxWait || C[i]<bxL) bxArm=false;
      else if(C[i]>bxH){ bxArm=false; if(filtOk && A14[i]!=null && (bxH-bxL)<=o.boxMaxAtr*A14[i] && info===0 && i>warmN){ info=10; iStop=bxL; } }
    }
    if(code===7 || code===8){ if(tfSec<14400) code=0; }
    if(code || info || lk) events.push({i, t:bars[i].ct, code, info, lk, px:C[i], stop: inT?curStop:null, stop0: (code>=1&&code<=4)?tStop:null, sz, pnl, iStop, dir, st:ST.st[i], stUp:ST.trend[i]===1, target: info===10 && iStop!=null ? C[i]+o.boxRR*(C[i]-iStop) : null});
  }
  const i=N-1;
  const last = N ? { i, t:bars[i].ct, close:C[i], inT, entry:tEntry, stop0:tStop, curStop, ladLvl, hiSince, entryT: inT?bars[entryI].ct:null, entryCode: inT?entryCode:null,
    st:ST.st[i], stUp:ST.trend[i]===1, ema:E[i], eLen, rsi:R[i], adx:D.adx[i], squeeze:sqA[i], rank:percentrank(bbw,o.sqLookback,i),
    btcUp: hiTF ? regimeAt(RW,Infinity) : regimeAt(RD,Infinity), warm: N>warmN } : null;
  if(inT) trades.push({entryI, entryT:bars[entryI].ct, entry:tEntry, stop0:tStop, code:entryCode, open:true, exit:C[i], pnl:(C[i]/tEntry-1)*100, R:(C[i]-tEntry)/tRisk, lvl:ladLvl, bars:i-entryI, curStop});
  return {events, trades, last};
}

/* ---------- PUMP RADAR ----------
   h: 1 saatlik kapanmış mumlar, d: günlük kapanmış mumlar, btcD: BTC günlük mumlar */
const PDEF={ minPts:2, volMult:3, moveMin:5, lateMax:30, wickMax:35, pBaseMax:35, brkHours:168, trailAtr:15, dTrailAtr:3 };
function pumpDaily(d, btcD, o){
  const {H,L,C,V}=cols(d), E=ema(C,200), A=atr(H,L,C,14), vs7=sma(V,7), vs60=sma(V,60), RB=regimeSeries(btcD,50);
  return d.map((b,i)=>{
    if(i<31) return null;
    const rng30=(hh(H,30,i)-ll(L,30,i))/C[i]*100, hh20=hh(H,20,i-1), med=pnr(V,30,i-1,50), vx=med?V[i]/med:0;
    const dr=(C[i]/C[i-1]-1)*100, r7= i>=7 ? (C[i]/C[i-7]-1)*100 : 0, wick=(H[i]-C[i])/Math.max(H[i]-L[i],1e-12)*100;
    const ign = C[i]>hh20 && vx>o.volMult && dr>o.moveMin && r7<o.lateMax && wick<o.wickMax;
    const near = C[i]>=0.9*hh(H,20,i);
    const btcUp = RB ? regimeAt(RB, b.ct+1) : null;
    return {t:b.t, ct:b.ct, e200: E[i]!=null && C[i]>E[i], tight: rng30<o.pBaseMax, vol: vs60[i]? vs7[i]/vs60[i]>1.3 : false, ign, near, r7, atr:A[i], close:C[i], high:H[i], low:L[i], btcUp, dr, vx};
  });
}
function pump(h, d, btcD, o){
  o=Object.assign({},PDEF,o||{});
  const PD=pumpDaily(d,btcD,o), {H,L,C,V}=cols(h), A1=atr(H,L,C,14), events=[], trades=[];
  const dIdx=t=>{ let lo=0, hi=d.length-1, j=-1; while(lo<=hi){ const m=(lo+hi)>>1; if(d[m].t<=t){ j=m; lo=m+1; } else hi=m-1; } return j; };
  const ptsOf=x=> x ? (x.btcUp?1:0)+(x.e200?1:0)+(x.tight?1:0)+(x.vol?1:0) : 0;
  // günlük olaylar
  let wPrev=false;
  for(let i=0;i<d.length;i++){
    const x=PD[i]; if(!x) continue; const pts=ptsOf(x);
    if(x.ign) events.push({t:x.ct, code:12, px:x.close, stop:x.close-2*x.atr, pts, r7:x.r7});
    const wRaw = x.tight && x.near && pts>=3 && x.r7<o.lateMax && !x.ign;
    if(wRaw && !wPrev) events.push({t:x.ct, code:13, px:x.close, pts});
    wPrev=wRaw;
  }
  // saatlik olaylar
  let lastLate=-Infinity, lastIgn=-Infinity, tr=null, pk=null, en=null, enT=null;
  for(let k=0;k<h.length;k++){
    if(k>=o.brkHours+5 && k>=168){
      const med=pnr(V,168,k-4,50), v4x = med? (V[k]+V[k-1]+V[k-2]+V[k-3])/(med*4) : 0;
      const r4=(C[k]/C[k-4]-1)*100, hhB=hh(H,o.brkHours,k-1), r7=(C[k]/C[k-168]-1)*100, hi4=hh(H,4,k), lo4=ll(L,4,k);
      const wick4=(hi4-C[k])/Math.max(hi4-lo4,1e-12)*100, stop0=Math.max(C[k]*0.88, ll(L,12,k));
      const di=dIdx(h[k].t)-1, x= di>=0 ? PD[di] : null, pts=ptsOf(x);
      const ign = v4x>o.volMult && r4>o.moveMin && C[k]>hhB && r7<o.lateMax && wick4<o.wickMax;
      if(ign && pts>=o.minPts && h[k].ct-lastIgn>DAY){ lastIgn=h[k].ct; events.push({t:h[k].ct, code:11, px:C[k], stop:stop0, pts, v4x, r4, r7}); if(tr==null){ tr=stop0; pk=H[k]; en=C[k]; enT=h[k].ct; continue; } }
      if(r7>o.lateMax && v4x>o.volMult && h[k].ct-lastLate>DAY){ events.push({t:h[k].ct, code:14, px:C[k], r7, v4x}); lastLate=h[k].ct; }
    }
    if(tr!=null && h[k].ct>enT){
      if(L[k]<=tr){ events.push({t:h[k].ct, code:15, px:tr, entry:en}); trades.push({entryT:enT, entry:en, exitT:h[k].ct, exit:tr, pnl:(tr/en-1)*100, code:11}); tr=null; pk=null; }
      else { pk=Math.max(pk,H[k]); if(A1[k]!=null) tr=Math.max(tr, pk-o.trailAtr*A1[k]); }
    }
  }
  if(tr!=null && h.length) trades.push({entryT:enT, entry:en, open:true, exit:C[h.length-1], pnl:(C[h.length-1]/en-1)*100, code:11, curStop:tr});
  // günlük ateşleme işlemleri (geriye dönük test için)
  const dTrades=[]; let dt=null;
  for(let i=0;i<d.length;i++){
    const x=PD[i]; if(!x) continue;
    if(dt){ if(x.low<=dt.tr){ dTrades.push({entryT:dt.t, entry:dt.en, exitT:x.ct, exit:dt.tr, pnl:(dt.tr/dt.en-1)*100, code:12}); dt=null; } else { dt.pk=Math.max(dt.pk,x.high); if(x.atr!=null) dt.tr=Math.max(dt.tr, dt.pk-o.dTrailAtr*x.atr); } }
    else if(x.ign && x.atr!=null) dt={t:x.ct, en:x.close, tr:x.close-2*x.atr, pk:x.high};
  }
  if(dt && d.length) dTrades.push({entryT:dt.t, entry:dt.en, open:true, exit:d[d.length-1].c, pnl:(d[d.length-1].c/dt.en-1)*100, code:12, curStop:dt.tr});
  const lastD = PD.length ? PD[PD.length-1] : null;
  return {events, trades, dTrades, lastD, pts: ptsOf(lastD)};
}

/* ---------- istatistik ---------- */
function stats(trades){
  const done=trades.filter(t=>!t.open), n=done.length;
  if(!n) return {n:0};
  const w=done.filter(t=>t.pnl>0), gw=w.reduce((a,t)=>a+t.pnl,0), gl=-done.filter(t=>t.pnl<=0).reduce((a,t)=>a+t.pnl,0);
  const hasR=done.every(t=>t.R!=null);
  let eq=0, peak=0, mdd=0; const curve=[];
  for(const t of done){ eq += hasR ? t.R : t.pnl; curve.push(eq); peak=Math.max(peak,eq); mdd=Math.max(mdd,peak-eq); }
  return { n, win:w.length/n*100, avg:done.reduce((a,t)=>a+t.pnl,0)/n, pf: gl>0? gw/gl : null, avgR: hasR? done.reduce((a,t)=>a+t.R,0)/n : null, totR: hasR? done.reduce((a,t)=>a+t.R,0) : null, mdd, unit: hasR?"R":"%", curve, best:Math.max(...done.map(t=>t.pnl)), worst:Math.min(...done.map(t=>t.pnl)) };
}

/* ---------- Binance mumları -> nesne ---------- */
function fromBinance(rows, now){ now=now||Date.now(); return rows.map(r=>({t:+r[0], o:+r[1], h:+r[2], l:+r[3], c:+r[4], v:+r[5], ct:+r[6]})).filter(b=>b.ct<now); }

const V7={ ind:{sma,ema,rma,atr,trueRange,supertrend,rsi,dmi,stdev,linreg,pnr,percentrank}, trend, pump, stats, fromBinance, regimeSeries, regimeAt, NAMES, DEF, PDEF, ladderOn, HOUR, DAY };
if(typeof module!=="undefined" && module.exports) module.exports=V7; else root.V7=V7;
})(typeof globalThis!=="undefined"?globalThis:this);
