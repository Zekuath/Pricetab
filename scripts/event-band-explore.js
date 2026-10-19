#!/usr/bin/env node
/* EXPLORATORY (18 Oct 2026, #159): the 24h band on release days. Not a test and decides nothing; see research/event-band-explore-2026-10-18.md.
 *   node scripts/event-band-explore.js "$PWD" */
// EXPLORATORY (not a test, no decision): does the 24h band hold on days with a US release?
const fs=require("fs"),path=require("path"),vm=require("vm");
const ROOT=process.argv[2];
const cfg=fs.readFileSync(path.join(ROOT,"src/config.js"),"utf8");
const grab=(name)=>{const m=cfg.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));return [...m[1].matchAll(/"([0-9T:Z-]+)"/g)].map(x=>Date.parse(x[1]))};
const rel={CPI:grab("CPI_RELEASES_UTC"),FOMC:grab("FOMC_RELEASES_UTC"),NFP:grab("NFP_RELEASES_UTC"),PCE:grab("PCE_RELEASES_UTC")};
const sb={Math,Float64Array,Array,Number,isFinite,Infinity,NaN,Object};vm.createContext(sb);
const O=vm.runInContext(fs.readFileSync(path.join(ROOT,"src/cell-odds.js"),"utf8")+"\n;({ oddsRegular, oddsPrepare, oddsColumn })",sb);
const G=21600,DAY=86400e3;
const q=(cdf,p)=>{let lo=-3,hi=3;for(let i=0;i<80&&hi-lo>1e-6;i++){const m=(lo+hi)/2;if(cdf(m)<p)lo=m;else hi=m}return(lo+hi)/2};
const groups={};const add=(k,inside,y,w)=>{(groups[k]=groups[k]||{n:0,in:0,abs:0,w:0});const g=groups[k];g.n++;if(inside)g.in++;g.abs+=Math.abs(y);g.w+=w};
for(const coin of ["BTC","ETH","SOL","XRP"]){
 const rows=JSON.parse(fs.readFileSync(path.join(ROOT,"docs/internal/research/vol-bars",`${coin}-${G}.json`),"utf8"));
 const s=O.oddsRegular(rows,G);const prep=O.oddsPrepare(s.close,G);
 for(let o=1000;o+4<s.close.length;o++){
  if((s.time[o]+G*1000)%DAY!==0)continue; if(s.filled[o]||s.filled[o+4])continue;
  const t0=s.time[o]+G*1000; if(t0<Date.parse("2022-01-01"))continue;
  const col=O.oddsColumn(prep,DAY,{end:o,model:"mr",lookback:3000}); if(!col)continue;
  const y=Math.log(s.close[o+4]/s.close[o]); const l=q(col.cdf,0.1),u=q(col.cdf,0.9);
  const kinds=Object.entries(rel).filter(([,ts])=>ts.some(t=>t>t0&&t<=t0+DAY)).map(([k])=>k);
  const inside=y>=l&&y<=u;
  add("all",inside,y,u-l); add(kinds.length?"release day":"no release",inside,y,u-l);
  for(const k of kinds) add(k,inside,y,u-l);
 }}
for(const [k,g] of Object.entries(groups)) console.log(`${k.padEnd(12)} n ${String(g.n).padStart(5)} · 80% held ${(g.in/g.n*100).toFixed(1)}% · mean |move| ${(g.abs/g.n*100).toFixed(2)}% · mean band width ${(g.w/g.n*100).toFixed(2)}%`);
