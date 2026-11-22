const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const branch=require('../training-case-branch.js');
const center=fs.readFileSync(path.join(__dirname,'../training-center.html'),'utf8');
const editor=fs.readFileSync(path.join(__dirname,'../training-editor.html'),'utf8');
const curator=fs.readFileSync(path.join(__dirname,'../training-curator.html'),'utf8');
const questions=[
  {question_id:'verdict',question_type:'single_choice',text:'Есть ли нарушение?'},
  {question_id:'rule',question_type:'open',text:'Пункт правил',visibility:{question_id:'verdict',option:'D',mode:'not_equals'}},
  {question_id:'punishment',question_type:'open',text:'Наказание',visibility:{question_id:'verdict',option:'D',mode:'not_equals'}},
  {question_id:'case_no_violation:one',question_type:'open',review_kind:'case_no_violation',text:'Почему вы считаете, что нарушения нет?',points:2,visibility:{question_id:'verdict',option:'D',mode:'equals'}},
  {question_id:'unrelated',question_type:'open',text:'Другой вопрос'},
];
test('branch uses frozen remapped option rather than assuming B or inspecting answer words',()=>{
  assert.deepEqual(branch.activeQuestions(questions,{}).map(q=>q.question_id),['verdict','unrelated']);
  assert.deepEqual(branch.activeQuestions(questions,{verdict:'D'}).map(q=>q.question_id),['verdict','case_no_violation:one','unrelated']);
  assert.deepEqual(branch.activeQuestions(questions,{verdict:'A'}).map(q=>q.question_id),['verdict','rule','punishment','unrelated']);
  assert.equal(branch.isVisible({text:'Почему нет нарушений?'},{}),true);
});
for(const [name,html] of [['curator',curator],['editor',editor]]){
  test(name+' partial reason grade sends awarded_points and requires a comment',async()=>{
    const calls=[],alerts=[],comment={value:''},question={dataset:{reviewQuestion:'reason',reviewKind:'case_no_violation',reviewPoints:'2'},querySelector(selector){return selector.includes(':checked')?{value:'1'}:comment},scrollIntoView(){}};
    comment.focus=()=>{};
    const form={dataset:{reviewForm:'attempt'},querySelectorAll(){return [question]}};
    const context=vm.createContext({FormData:class{get(){return ''}},tg:{showAlert:value=>alerts.push(value)},setBusy(){},api:async(...args)=>calls.push(args),reload:async()=>{},refreshBootstrap:async()=>{},renderReviews:async()=>{},encodeURIComponent});
    vm.runInContext(html.split('\n').find(line=>line.includes('async function submitReview(')),context);
    await context.submitReview({preventDefault(){},currentTarget:form,submitter:{}});
    assert.equal(calls.length,0);assert.equal(alerts.length,1);
    comment.value='Важный признак не объяснён';
    await context.submitReview({preventDefault(){},currentTarget:form,submitter:{}});
    assert.equal(calls.length,1);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1].decisions)),{reason:{awarded_points:1,comment:'Важный признак не объяснён'}});
  });
}
test('editor serializes only enabled explicit branch configuration',()=>{
  const context=vm.createContext({});
  vm.runInContext(editor.slice(editor.indexOf('    function caseBranchValue('),editor.indexOf('    showCaseModal=function(item={})')),context);
  const elements={'[data-branch-enable]':{checked:false},'[data-branch-parent]':{value:'verdict'},'[data-branch-option]':{value:'D'}};
  const form={querySelector:selector=>elements[selector],querySelectorAll:()=>[{value:'rule',disabled:false},{value:'punishment',disabled:false},{value:'verdict',disabled:true}]};
  assert.equal(context.caseBranchValue(form),'');
  elements['[data-branch-enable]'].checked=true;
  assert.deepEqual(JSON.parse(context.caseBranchValue(form)),{question_id:'verdict',no_violation_option:'D',skip_question_ids:['rule','punishment']});
});
test('branch configuration round-trips explicit references without guessing by text',()=>{
  const config={question_id:'parent',no_violation_option:'c',skip_question_ids:['rule','punishment','rule']};
  assert.deepEqual(branch.parseConfig(JSON.stringify(config)),{question_id:'parent',no_violation_option:'C',skip_question_ids:['rule','punishment']});
  for(const invalid of ['',null,'not json','[]','{}','{"question_id":"p","no_violation_option":"E","skip_question_ids":["r"]}'])assert.equal(branch.parseConfig(invalid),null);
});
function fixture(){
  const fields=new Map(questions.map(q=>[q.question_id,{value:'',disabled:false}]));
  const panels=questions.map(q=>({dataset:{testQuestion:q.question_id},classes:new Set(),attrs:{},title:{textContent:''},
    classList:{toggle(name,enabled){enabled?this.owner.classes.add(name):this.owner.classes.delete(name)}},
    setAttribute(name,value){this.attrs[name]=value},querySelectorAll(){return [fields.get(q.question_id)]},querySelector(){return this.title}}));
  panels.forEach(p=>{p.classList.owner=p});
  const button={disabled:false,textContent:'Завершить тест'},count={textContent:''},view={innerHTML:''},after={},calls=[],alerts=[];
  const form={querySelector(selector){if(selector==='button[type=submit]')return button;const name=selector.match(/\[name="([^"]+)"\]/)?.[1];const field=fields.get(name);return selector.includes(':checked')&&!field?.value?null:field},querySelectorAll(){return panels}};
  const context=vm.createContext({currentQuestions:structuredClone(questions),TrainingCaseBranch:branch,CSS:{escape:String},$:id=>({testForm:form,testQuestionCount:count,lessonView:view,afterTest:after}[id]),tg:{showAlert:value=>alerts.push(value)},document:{getElementById:()=>null},currentAttempt:{attempt_id:'a1'},api:async(...args)=>{calls.push(args);return {pending_review:true}},clearQuestionMedia:()=>{},currentBank:{bank_type:'entry'},encodeURIComponent});
  vm.runInContext(center.slice(center.indexOf('    function readTestFormAnswers('),center.indexOf('    function testQuestionHtml(')),context);
  const submit=center.split('\n').find(line=>line.includes('async function submitTest('));vm.runInContext(submit,context);
  return {context,form,fields,panels,button,count,view,calls,alerts};
}
test('switching branches hides and disables irrelevant fields but preserves both drafts',()=>{
  const f=fixture();f.fields.get('rule').value='Пункт 1';f.fields.get('punishment').value='Наказание';f.fields.get('case_no_violation:one').value='Нет состава нарушения';
  f.fields.get('verdict').value='D';f.context.updateTestQuestionVisibility();
  assert.equal(f.fields.get('rule').disabled,true);assert.equal(f.fields.get('case_no_violation:one').disabled,false);
  assert.ok(f.panels[1].classes.has('hidden'));assert.equal(f.count.textContent,'3 вопросов');
  f.fields.get('verdict').value='A';f.context.updateTestQuestionVisibility();
  assert.equal(f.fields.get('rule').value,'Пункт 1');assert.equal(f.fields.get('rule').disabled,false);
  assert.equal(f.fields.get('case_no_violation:one').value,'Нет состава нарушения');assert.equal(f.fields.get('case_no_violation:one').disabled,true);
  assert.equal(f.panels[2].title.textContent,'3. Наказание');assert.equal(f.count.textContent,'4 вопросов');
});
test('no-violation submission requires explanation and sends no stale hidden answers',async()=>{
  const f=fixture();f.fields.get('verdict').value='D';f.fields.get('unrelated').value='Ответ';f.fields.get('rule').value='Старый ответ';
  await f.context.submitTest({preventDefault(){},currentTarget:f.form});
  assert.equal(f.calls.length,0);assert.equal(f.alerts.length,1);
  f.fields.get('case_no_violation:one').value='Видна IC-ситуация, нарушение не установлено';
  await f.context.submitTest({preventDefault(){},currentTarget:f.form});
  assert.equal(f.calls.length,1);
  const answers=JSON.parse(JSON.stringify(f.calls[0][1].answers));
  assert.deepEqual(Object.keys(answers),['verdict','case_no_violation:one','unrelated']);
  assert.match(f.view.innerHTML,/отправлены на проверку/);
});
test('ordinary branch still requires its rule and punishment',async()=>{
  const f=fixture();f.fields.get('verdict').value='A';f.fields.get('unrelated').value='Ответ';f.fields.get('case_no_violation:one').value='Черновик';
  await f.context.submitTest({preventDefault(){},currentTarget:f.form});assert.equal(f.calls.length,0);
  f.fields.get('rule').value='Пункт';f.fields.get('punishment').value='Наказание';
  await f.context.submitTest({preventDefault(){},currentTarget:f.form});assert.equal(f.calls.length,1);
  assert.deepEqual(Object.keys(f.calls[0][1].answers),['verdict','rule','punishment','unrelated']);
});
test('editor offers explicit no-violation trigger and selected followups',()=>{
  const context=vm.createContext({TrainingCaseBranch:branch,esc:value=>String(value??'').replaceAll('<','&lt;')});
  vm.runInContext(editor.slice(editor.indexOf('    function caseBranchEditorHtml('),editor.indexOf('    function bindCaseBranchEditor(')),context);
  const html=context.caseBranchEditorHtml({case_id:'c',no_violation_branch_json:JSON.stringify({question_id:'verdict',no_violation_option:'D',skip_question_ids:['rule','punishment']})},questions.map(q=>({...q,case_id:'c',active:'true'})));
  assert.match(html,/data-branch-enable checked/);assert.match(html,/data-branch-parent/);assert.match(html,/data-branch-option/);assert.match(html,/data-branch-skip/);assert.match(html,/новых попыток/);
  assert.doesNotMatch(html,/<option value="rule"/);
});
for(const [name,html] of [['curator',curator],['editor',editor]]){
  test(name+' reason review offers partial points without AI feedback',()=>{
    const context=vm.createContext({esc:String,reviewCommentHtml:()=>'',reviewMediaHtml:()=>''});
    const start=html.indexOf('    function reviewAnswerHtml('),end=html.indexOf('    function reviewItemsHtml(',start);
    vm.runInContext(html.slice(start,end),context);
    const result=context.reviewAnswerHtml({question_id:'reason',review_kind:'case_no_violation',text:'Почему?',answer:'Обоснование',points:2},0);
    assert.match(result,/data-review-kind="case_no_violation"/);
    for(const score of [0,1,2])assert.match(result,new RegExp('value="'+score+'" data-review-decision'));
    assert.doesNotMatch(result,/Предварительная оценка ИИ|data-practical-feedback/);
  });
}
test('modified inline scripts parse and helper is loaded before the center code',()=>{
  for(const html of [center,editor,curator])for(const [,source]of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(source);
  assert.ok(center.indexOf('src="training-case-branch.js')<center.indexOf('function readTestFormAnswers'));
});
