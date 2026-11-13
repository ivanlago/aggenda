import assert from "node:assert/strict";
import test from "node:test";
import { professionalNameChoice } from "../src/lib/professional-name-choice";
const people=[{id:"marina",name:"Dra. Marina Costa"},{id:"sandra",name:"Sandra de Sá"}];
test("professional names tolerate omitted titles, accents and small typos, without silently selecting",()=>{
  assert.deepEqual(professionalNameChoice(people,"Dra. Maria Costa")?.candidates.map(p=>p.id),["marina"]);
  assert.equal(professionalNameChoice(people,"Dra. Maria Costa")?.exact,false);
  assert.equal(professionalNameChoice(people,"MARINA COSTA")?.exact,true);
  assert.equal(professionalNameChoice(people,"sandra de sa")?.exact,true);
  assert.equal(professionalNameChoice(people,"Dra. Marnia Costa")?.exact,false);
  assert.equal(professionalNameChoice(people,"amanhã à tarde"),null);
  assert.equal(professionalNameChoice(people,"12:00"),null);
  const ambiguous=professionalNameChoice([...people,{id:"maria",name:"Dra. Maria Costa"}],"Marna Costa");
  assert.equal(ambiguous?.candidates.length,2);
  assert.equal(professionalNameChoice([...people,{id:"maria",name:"Dra. Maria Costa"}],"Maria Costa")?.candidates[0].id,"maria","an actual Maria takes priority over a similar Marina");
});

