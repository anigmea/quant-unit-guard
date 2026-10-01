#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { convertMoment, convertCovariance, validateMoment, validateCovariance, assertVolCovariance, UnitError } from './index.js';
const help = 'quant-unit-guard <validate|convert> <input.json|->\nvalidate: {moment?, covariance?, volatilities?}\nconvert: {moment OR covariance, target:{period,scale,observationsPerYear?}}\nJSON result to stdout. Invalid input exits 1. No network or inferred units.';
try {
  const [cmd, path, ...extra] = process.argv.slice(2);
  if (cmd === '--version') { console.log('0.1.0'); }
  else if (!cmd || cmd === '--help') { console.log(help); }
  else {
    if (!['validate', 'convert'].includes(cmd) || !path || extra.length) throw new UnitError(help);
    const input = JSON.parse(readFileSync(path === '-' ? 0 : path, 'utf8'));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new UnitError('Expected a JSON object');
    if (cmd === 'convert') {
      if (!input.target || !!input.moment === !!input.covariance) throw new UnitError('Supply exactly one of moment/covariance and a target');
      console.log(JSON.stringify(input.moment ? convertMoment(input.moment, input.target) : convertCovariance(input.covariance, input.target)));
    } else {
      if (!input.moment && !input.covariance) throw new UnitError('Supply moment or covariance');
      if (input.moment) validateMoment(input.moment);
      if (input.covariance) validateCovariance(input.covariance);
      if (input.volatilities) {
        if (!input.covariance) throw new UnitError('volatilities require covariance');
        assertVolCovariance(input.volatilities, input.covariance);
      }
      console.log(JSON.stringify({valid:true}));
    }
  }
} catch (err) {
  console.error(JSON.stringify({valid:false,error:err instanceof Error ? err.message : String(err)}));
  process.exitCode = 1;
}
