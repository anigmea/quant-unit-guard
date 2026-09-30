import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { convertMoment, convertCovariance, validateMoment, validateCovariance, assertVolCovariance } from '../dist/index.js';
const m=(value,kind='volatility',period='daily',scale='decimal')=>({value,kind,period,scale});
const c=(values,period='daily',scale='decimal')=>({values,period,scale});
const close=(a,b)=>assert.ok(Math.abs(a-b)<=Math.max(Math.abs(b)*1e-12,1e-15),`${a} != ${b}`);
test('daily volatility annualizes with sqrt N, not N',()=>close(convertMoment(m(.02),{period:'annual',scale:'decimal',observationsPerYear:252}).value,.02*Math.sqrt(252)));
test('log mean scales linearly, including negative means',()=>close(convertMoment(m(-.001,'logMean'),{period:'annual',scale:'decimal',observationsPerYear:250}).value,-.25));
test('percent is explicit, never guessed',()=>{close(convertMoment(m(2,'volatility','daily','percent'),{period:'daily',scale:'decimal'}).value,.02); assert.equal(validateMoment(m(2)).value,2);});
test('changing periods requires frequency, no 252 default',()=>assert.throws(()=>convertMoment(m(.02),{period:'annual',scale:'decimal'}),/explicit/));
test('invalid units, values and frequencies rejected',()=>{
 for(const v of [NaN,Infinity,'0.2',null]) assert.throws(()=>validateMoment(m(v)));
 for(const v of [-1,0,Infinity,'252']) assert.throws(()=>convertMoment(m(.02),{period:'annual',scale:'decimal',observationsPerYear:v}));
 assert.throws(()=>validateMoment(m(-.02)));
 assert.throws(()=>validateMoment({...m(.02),period:'monthly'}));
 assert.throws(()=>validateMoment({...m(.02),kind:'arithmeticMean'}));
 assert.throws(()=>convertMoment(m(.02),{period:'daily',scale:'bps'}));
});
test('moment round trips for both scales and kinds',()=>{
 for(const kind of ['volatility','logMean']) for(const value of [0,.001,2,100]) {
 const original=m(value,kind); const annual=convertMoment(original,{period:'annual',scale:'percent',observationsPerYear:365});
 close(convertMoment(annual,{period:'daily',scale:'decimal',observationsPerYear:365}).value,value);
 }
});
test('covariance scale conversion squares percent factor',()=>{
 const out=convertCovariance(c([[4,3.6],[3.6,9]],'daily','percent'),{period:'daily',scale:'decimal'});
 close(out.values[0][0],.0004);close(out.values[0][1],.00036);close(out.values[1][1],.0009);
});
test('covariance annualizes linearly and round trips',()=>{
 const original=c([[.0004,.00036],[.00036,.0009]]);
 const out=convertCovariance(original,{period:'annual',scale:'percent',observationsPerYear:252});
 close(out.values[0][0],1008);
 const back=convertCovariance(out,{period:'daily',scale:'decimal',observationsPerYear:252});
 back.values.forEach((row,i)=>row.forEach((x,j)=>close(x,original.values[i][j])));
});
test('accepts singular and zero PSD covariance without mutating',()=>{
 for(const values of [[[0,0],[0,0]],[[1,1],[1,1]],[[1,-1],[-1,1]],[[0,0],[0,2]]]) {
 const original=c(values);const copy=JSON.stringify(original);validateCovariance(original);assert.equal(JSON.stringify(original),copy);
 }
});
test('rejects non-square, asymmetric, negative and indefinite covariance',()=>{
 for(const values of [[],[[1,2]],[[1,1],[0,1]],[[-1]],[[1,2],[2,1]],[[0,.1],[.1,1]],[[1,1,1],[1,1,-1],[1,-1,1]],[[NaN]]]) assert.throws(()=>validateCovariance(c(values)));
});
test('PSD test rejects hidden negative variance and tiny indefinite matrices',()=>{
 assert.throws(()=>validateCovariance(c([[1e-20,2e-20],[2e-20,1e-20]])));
 assert.throws(()=>validateCovariance(c([[1,0,0],[0,1,2],[0,2,1]])));
});
test('PSD accepts seeded Gram matrices including rank deficiency',()=>{
 let seed=42; const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32-.5;};
 for(let n=1;n<=12;n++) {
 const b=Array.from({length:n},()=>Array.from({length:Math.max(1,n-2)},rand));
 const gram=b.map(row=>b.map(other=>row.reduce((s,x,k)=>s+x*other[k],0)));
 validateCovariance(c(gram));
 }
});
test('volatility and covariance must share explicit units and diagonal',()=>{
 const cov=c([[.0004,.00036],[.00036,.0009]]);assertVolCovariance([m(.02),m(.03)],cov);
 assert.throws(()=>assertVolCovariance([m(2,'volatility','daily','percent'),m(.03)],cov),/units/);
 assert.throws(()=>assertVolCovariance([m(.02,'volatility','annual'),m(.03)],cov),/units/);
 assert.throws(()=>assertVolCovariance([m(.02),m(.04)],cov),/diagonal/);
 assert.throws(()=>assertVolCovariance([m(.02)],cov));
 assertVolCovariance([m(0)],c([[0]]));assert.throws(()=>assertVolCovariance([m(0)],c([[1e-30]])));
});
test('overflow fails loudly',()=>{
 assert.throws(()=>convertMoment(m(1e308),{period:'annual',scale:'percent',observationsPerYear:365}));
 assert.throws(()=>convertCovariance(c([[1e308]]),{period:'annual',scale:'percent',observationsPerYear:365}));
});
test('CLI validates, converts, rejects bad inputs with exit 1',()=>{
 const run=(command,input)=>spawnSync(process.execPath,['dist/cli.js',command,'-'],{input:JSON.stringify(input),encoding:'utf8'});
 let out=run('validate',{covariance:c([[.0004]]),volatilities:[m(.02)]});assert.equal(out.status,0);assert.deepEqual(JSON.parse(out.stdout),{valid:true});
 out=run('convert',{moment:m(2,'volatility','daily','percent'),target:{period:'daily',scale:'decimal'}});assert.equal(out.status,0);close(JSON.parse(out.stdout).value,.02);
 out=run('validate',{moment:m('2')});assert.equal(out.status,1);assert.match(out.stderr,/finite number/);
 out=run('convert',{moment:m(.02),covariance:c([[.0004]]),target:{period:'daily',scale:'decimal'}});assert.equal(out.status,1);
});
