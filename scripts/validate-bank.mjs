import fs from 'node:fs/promises';
import {validateBank} from '../src/domain.js';
const filename=process.argv[2]||new URL('../data/seed-bank.json',import.meta.url);
const bank=validateBank(JSON.parse(await fs.readFile(filename,'utf8')));
console.log(JSON.stringify({status:'PASS',bankVersion:bank.bankVersion,written:bank.questions.filter(q=>q.type==='written'&&q.verificationStatus==='published').length,practical:bank.questions.filter(q=>q.type==='practical'&&q.verificationStatus==='published').length,testOnly:bank.questions.filter(q=>q.testOnly).length,sourceRecords:bank.sources.length},null,2));
