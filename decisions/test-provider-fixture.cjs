// Synthetic provider wire response, never a substitute for paid-service evidence.
module.exports = function reply(request) {
 const answers={};
 for(const [name,q] of Object.entries(request.questions)){
  if(q.type==='noul')answers[name]={type:'noul',noul:0};
  else if(q.type==='score'){
   const score=name==='speed'||name==='threatTolerance'?2:name==='caution'||name==='stamina'?0:1;
   answers[name]={type:'score',score,confidence:1,probabilities:{[score]:1}};
  }else{
   const keys=Object.keys(q.criteria);
   const choice=name==='appearance'?'curious':name==='behavior'&&keys.includes('rest')?'rest':keys[0];
   answers[name]={type:'choice',choice,confidence:1,probabilities:{[choice]:1}};
  }
 }
 return {model:request.model,id:'synthetic-browser-test',answers,usage:{cost:.00002,input_tokens:100,output_tokens:20}};
};
