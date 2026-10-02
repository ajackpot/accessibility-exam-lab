import path from 'node:path';
import {readBankInput} from './bank-io.mjs';
const {bank}=await readBankInput(path.resolve(import.meta.dirname,'..'),process.argv[2]);
console.log(JSON.stringify({status:'PASS',bankVersion:bank.bankVersion,written:bank.questions.filter(q=>q.type==='written'&&q.verificationStatus==='published').length,practical:bank.questions.filter(q=>q.type==='practical'&&q.verificationStatus==='published').length,testOnly:bank.questions.filter(q=>q.testOnly).length,regularWritten:bank.questions.filter(q=>q.type==='written'&&q.verificationStatus==='published'&&!q.testOnly).length,regularPractical:bank.questions.filter(q=>q.type==='practical'&&q.verificationStatus==='published'&&!q.testOnly).length,sourceRecords:bank.sources.length},null,2));
