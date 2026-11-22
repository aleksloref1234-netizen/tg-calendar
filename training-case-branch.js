(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TrainingCaseBranch=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function isVisible(question,answers={}){
    const rule=question?.visibility;
    if(!rule||!rule.question_id||!['equals','not_equals'].includes(rule.mode)||!['A','B','C','D'].includes(String(rule.option||'').toUpperCase()))return true;
    const answer=String(answers[rule.question_id]||'').trim().toUpperCase();
    if(!answer)return false;
    const matches=answer===String(rule.option).toUpperCase();
    return rule.mode==='equals'?matches:!matches;
  }
  function activeQuestions(questions,answers={}){
    return (questions||[]).filter(question=>isVisible(question,answers));
  }
  function parseConfig(value){
    try{
      const data=typeof value==='string'?JSON.parse(value||'{}'):value;
      if(!data||typeof data!=='object'||Array.isArray(data))return null;
      const question_id=String(data.question_id||''),no_violation_option=String(data.no_violation_option||'').toUpperCase();
      const skip_question_ids=Array.isArray(data.skip_question_ids)?[...new Set(data.skip_question_ids.map(String).filter(Boolean))]:[];
      return question_id&&['A','B','C','D'].includes(no_violation_option)&&skip_question_ids.length?{question_id,no_violation_option,skip_question_ids}:null;
    }catch{return null}
  }
  return {isVisible,activeQuestions,parseConfig};
});
