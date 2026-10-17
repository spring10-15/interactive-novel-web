const assert = require('assert/strict');
const fs = require('fs');
// VM对象原型不同；比较实际持久化的JSON内容。
const sameJSON = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
const path = require('path');
const vm = require('vm');
const ts = require(process.cwd() + '/node_modules/typescript');
const progressModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/story-progress.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: progressModule.exports });
const progress = progressModule.exports;
function validReview() {
  return {
    progressMade: true, milestoneReached: true, goalResolved: true, openMainThreads: [],
    reason: '本节已发生具体行动和成果，兑现指定节点', sectionTitle: '行动的结果',
    state: { summary: '主角已取得关键成果', location: '新的地点', latestProgress: '主角通过行动解决了当前障碍', openThreads: [], turningPoints: ['选择已经产生代价'] },
    choice1: '追踪目标', choice1_desc: '立即沿线索行动',
    choice2: '帮助同伴', choice2_desc: '以具体行动改变关系',
    choice3: '面对冲突', choice3_desc: '承担代价并解决障碍',
    endingTitle: '选择的归处', endingType: 'normal',
  };
}
const base = {
  _id: 'fixture-novel', userId: 'fixture-user', prompt: '一个测试故事',
  currentContent: '原来的完整正文', currentChoices: ['选项1：救人\n帮助同伴', '选项2：离开\n独自离开', '选项3：等待\n等待回应'],
  currentRound: 1, history: [{round: 0, content: '第一节', choice: '选项1：出发'}],
  chapters: [{chapterIndex:0,startRound:0,endRound:3,title:'第一章'}],
  totalRounds:10,isEnded:false,currentSectionTitle:'原小节标题',
};
function harness(page, novel=structuredClone(base), options={}) {
  const sourcePath = page === 'preview' && process.env.NOVEL_PREVIEW_PATH
    ? process.env.NOVEL_PREVIEW_PATH : path.join('app',page,'page.tsx');
  let source=fs.readFileSync(sourcePath,'utf8');
  source = page==='preview'
    ? source.replace('  // ── 加载中：用骨架屏替代干等的文字', '  return { handleChoice, generateContent };\n  // ── 加载中：用骨架屏替代干等的文字')
    : source.replace('  if (loading) {', '  return { handleRewindToRound };\n  if (loading) {');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const states=[],novelStates=[],refs=[],effects=[],requests=[],updates=[],writeIds=[],toasts=[],routes=[];let stateIndex=0,refIndex=0,reviewIndex=0,streamIndex=0,novelId='fixture-novel';
  const react={
    useState(initial) { const i=stateIndex++; if(!(i in states))states[i]=i===0?novel:i===2?false:initial; return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;if(i===0)novelStates.push(states[i]);}]; },
    useRef(initial) { const i=refIndex++; if(!(i in refs))refs[i]={current:initial};return refs[i]; },
    useEffect(cb,deps) {effects.push({cb,deps});},
  };
  const deps={
    'react':react,'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null},
    'next/navigation':{useRouter:()=>({push:x=>routes.push(x),back:()=>{}}),useSearchParams:()=>new URLSearchParams('id='+novelId)},
    '@/lib/db':{db:{collection:()=>({doc:id=>({update:async data=>{updates.push(data);writeIds.push(id);if(options.saveError)throw Error('保存失败');}})})}},
    '@/lib/auth':{getCurrentUser:()=>({_id:'fixture-user'})},
    '@/lib/story-progress':progress,
    '@/lib/ai-client':{
      callAIChatStream:async data=>{requests.push({kind:'stream',data});if(options.stream) return options.stream(data);if(options.streamError) throw Error('正文失败');const body=streamIndex++===0?'新正文':`新正文${streamIndex}`;data.onChunk?.(body,body);return body;},
      callAIChat:async data=>{requests.push({kind:'chat',data});if(options.optionsError)throw Error('选项失败');const review=typeof options.review==='function'?await options.review(data,reviewIndex++):options.review||validReview();return typeof review==='string'?review:JSON.stringify(review);},
    },
    '@/components/Toast':{useToast:()=>({show:(...args)=>toasts.push(args)})},
    '@/components/Skeleton':{SkeletonReader:()=>null},'@/components/ConfirmModal':()=>null,
  };
  const context={exports:{},module:{exports:{}},require:n=>{if(!(n in deps))throw Error('Unexpected import '+n);return deps[n];},AbortController,console:{log(){},warn(){},error(){}},setInterval,clearInterval,setTimeout,clearTimeout,localStorage:{getItem(){return null;}},URLSearchParams};
  vm.createContext(context);vm.runInContext(js,context);
  const result={states,novelStates,refs,effects,requests,updates,writeIds,toasts,routes,handlers:null,novel};
  result.render=(nextNovelId)=>{if(nextNovelId!==undefined)novelId=nextNovelId;stateIndex=0;refIndex=0;result.handlers=context.exports.default();return result.handlers;};
  result.render();
  return result;
}
(async()=>{
  for(const failure of ['streamError','optionsError','saveError']){
    const h=harness('preview',structuredClone(base),{[failure]:true});
    await h.handlers.handleChoice(base.currentChoices[0]);
    assert.equal(h.states[0],h.novel,failure+' must restore exact prior novel');
    assert.equal(h.states[3],false);assert.equal(h.states[4],false);assert.equal(h.states[9],false);
    assert.equal(h.refs[1].current,null);assert.equal(h.toasts.length,1);
    assert.equal(h.states[1].at(-1).content,base.currentContent);sameJSON(h.states[1].at(-1).choices,base.currentChoices);
    console.log('PASS failure rollback: '+failure);
  }
  let resolveStream;
  const pending=harness('preview',structuredClone(base),{stream:()=>new Promise(resolve=>{resolveStream=resolve;})});
  const first=pending.handlers.handleChoice(base.currentChoices[0]);
  await pending.handlers.handleChoice(base.currentChoices[1]);
  assert.equal(pending.requests.length,1,'concurrent choice must be ignored');
  resolveStream('完成正文');await first;
  assert.equal(pending.updates.length,1);sameJSON(pending.updates[0].history.at(-1).choices,base.currentChoices);
  assert.equal(pending.states[3],false);console.log('PASS one generation at a time and history retains original choices');
  const aborted=harness('preview',structuredClone(base),{stream:data=>new Promise((resolve,reject)=>data.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))))});
  const flight=aborted.handlers.handleChoice(base.currentChoices[0]);
  aborted.effects[0].cb()();await flight;
  assert.equal(aborted.updates.length,0);assert.equal(aborted.toasts.length,0);assert.equal(aborted.refs[1].current,null);
  assert.equal(aborted.requests[0].data.signal.aborted,true);console.log('PASS unmount aborts pending generation without saving');
  const long=structuredClone(base);long.history=Array.from({length:19},(_,round)=>({round,content:'第'+(round+1)+'节开始'+ '甲'.repeat(500)+'第'+(round+1)+'节结束',choice:'选项1：前进'}));long.currentRound=19;long.currentContent='第20节开始'+'乙'.repeat(500)+'第20节结束';
  const longA=harness('preview',structuredClone(long));await longA.handlers.handleChoice(base.currentChoices[0]);
  const longB=harness('preview',structuredClone(long));await longB.handlers.handleChoice(base.currentChoices[1]);
  const promptA=longA.requests[0].data.userPrompt,promptB=longB.requests[0].data.userPrompt;
  assert.ok(promptA.length<=8000);assert.ok(promptA.includes('第20节开始'));assert.ok(promptA.includes('第20节结束'));assert.ok(promptA.includes(base.currentChoices[0]));assert.notEqual(promptA,promptB);assert.ok(!promptA.includes('第1节开始'));
  assert.ok(longA.requests.every(r=>!('model' in r.data)));console.log('PASS long context keeps complete latest section and latest choice, omitting old history ('+promptA.length+' chars)');
  const oversize=structuredClone(base);oversize.currentContent='甲'.repeat(8001);const huge=harness('preview',oversize);await huge.handlers.handleChoice(base.currentChoices[0]);assert.equal(huge.requests.length,0);assert.equal(huge.states[0],oversize);console.log('PASS oversized latest section fails safely without truncating');
  for(const patch of [{progressMade:'false'},{progressMade:undefined}]){
    const rejected=harness('preview',structuredClone(base),{review:{...validReview(),...patch}});
    await rejected.handlers.handleChoice(base.currentChoices[0]);
    assert.equal(rejected.updates.length,0,'missing or malformed core review fields must never save');
    assert.equal(rejected.requests.filter(r=>r.kind==='stream').length,1,'format failures retry review without rewriting');
    assert.equal(rejected.requests.filter(r=>r.kind==='chat').length,2,'review retries must remain bounded');
    sameJSON(rejected.requests[1].data.userPrompt,rejected.requests[2].data.userPrompt,'format retries review the same body');
    assert.equal(rejected.states[0],rejected.novel,'rejected drafts must restore the prior novel');
    sameJSON(rejected.states[0].history,base.history);
    assert.equal(rejected.toasts.at(-1)[1],'error');
  }
  console.log('PASS missing or malformed core flags reject saving after bounded same-body review retries');
  let improvedDraft=0;
  const improved=harness('preview',structuredClone(base),{stream:data=>{const body=improvedDraft++===0?'前稿唯一标记：已找到同伴但尚未救出':'修订后的完整正文：救出同伴';data.onChunk?.(body,body);return body;},review:(_data,index)=>({...validReview(),progressMade:index>0})});
  await improved.handlers.handleChoice(base.currentChoices[0]);assert.equal(improved.updates.length,1);assert.equal(improved.requests.length,4);
  const correctedRequest=improved.requests.filter(request=>request.kind==='stream')[1].data;
  assert.ok(correctedRequest.systemPrompt.includes('前稿唯一标记：已找到同伴但尚未救出'),'correction must receive the previous draft');
  assert.ok(correctedRequest.systemPrompt.includes(validReview().reason),'correction must receive the actual review reason');
  assert.equal(improved.updates[0].currentContent,'修订后的完整正文：救出同伴');console.log('PASS one corrective draft receives prior text and review reason, then recovers and saves exactly once');
  const finalBase={...structuredClone(base),currentRound:10,storyPlan:progress.normalizeStoryPlan(null,base.prompt),storyState:progress.normalizeStoryState({summary:'决战前的已知事实',location:'城门',latestProgress:'来到城门'})};
  for(const patch of [{goalResolved:false},{openMainThreads:['主线敌人尚未解决']},{milestoneReached:false},{progressMade:false}]){
    const rejected=harness('preview',structuredClone(finalBase),{review:{...validReview(),...patch}});
    await rejected.handlers.handleChoice(base.currentChoices[0]);
    assert.equal(rejected.updates.length,0,'unresolved ending must not save');assert.equal(rejected.requests.length,4);assert.equal(rejected.states[0],rejected.novel);
  }
  console.log('PASS unresolved final goal, open suspense, failed milestone or no progress still rejects both final drafts');
  const final=harness('preview',structuredClone(finalBase));await final.handlers.handleChoice(base.currentChoices[0]);
  assert.equal(final.updates.length,1);assert.equal(final.updates[0].isEnded,true);assert.equal(final.updates[0].currentChoices.length,0);assert.equal(final.updates[0].totalRounds,12);assert.equal(final.updates[0].currentRound,11);
  assert.equal(JSON.stringify(final.updates[0].history.at(-1).storyState),JSON.stringify(finalBase.storyState));assert.equal(JSON.stringify(final.updates[0].history.at(-1).storyPlan),JSON.stringify(finalBase.storyPlan));
  const requestCount=final.requests.length;final.render();await final.handlers.handleChoice(base.currentChoices[0]);assert.equal(final.requests.length,requestCount);assert.equal(final.updates.length,1);console.log('PASS valid final saves an ended 12-section story with no choices, and further choice makes zero AI calls');
  const legacyClose=harness('preview',structuredClone(long));
  for(let index=0;index<3;index++){
    await legacyClose.handlers.handleChoice(base.currentChoices[0]);
    assert.equal(legacyClose.updates[index].storyPlan.totalSections,23);assert.equal(legacyClose.updates[index].currentRound,20+index);assert.equal(legacyClose.updates[index].isEnded,index===2);
    legacyClose.render();
  }
  assert.equal(legacyClose.states[0].history.length,long.history.length+3);sameJSON(legacyClose.states[0].history.slice(0,long.history.length),long.history);
  const legacyRequests=legacyClose.requests.length;await legacyClose.handlers.handleChoice(base.currentChoices[0]);assert.equal(legacyClose.requests.length,legacyRequests);console.log('PASS first legacy long-story migration preserves all history and closes in exactly three new sections');
  const rewind=structuredClone(base);rewind.currentRound=8;rewind.storyPlan=progress.normalizeStoryPlan(null,base.prompt);rewind.storyState=progress.normalizeStoryState({summary:'未来决战事实不能混入回退',location:'未来战场',latestProgress:'未来已经战胜敌人'});const historicalState=progress.normalizeStoryState({summary:'当时只有起点的事实',location:'村口',latestProgress:'找到第一条线索'});rewind.history=[{round:0,content:'第1节'},{round:1,content:'第2节',sectionTitle:'旧标题',choices:['旧选项1','旧选项2','旧选项3'],storyState:historicalState,storyPlan:rewind.storyPlan},{round:2,content:'第3节'}];rewind.chapters=[{startRound:0,endRound:3},{startRound:4,endRound:7},{startRound:8,endRound:11}];
  const back=harness('read',rewind);await back.handlers.handleRewindToRound(1);
  assert.equal(back.requests.length,0);sameJSON(back.updates[0].currentChoices,rewind.history[1].choices);assert.equal(back.updates[0].history.length,1);assert.equal(back.updates[0].chapters.length,1);assert.equal(back.updates[0].currentRound,1);assert.equal(JSON.stringify(back.updates[0].storyState),JSON.stringify(historicalState));assert.equal(JSON.stringify(back.updates[0].storyPlan),JSON.stringify(rewind.history[1].storyPlan));assert.ok(!JSON.stringify(back.updates[0].storyState).includes('未来'));console.log('PASS rewind restores historical choices and fact state, preserving plan and pruning future branch chapters');
  const longRewind=structuredClone(rewind);longRewind.currentRound=30;longRewind.storyPlan={...progress.normalizeStoryPlan(null,base.prompt),totalSections:34};longRewind.history=[{round:15,content:'旧长篇第16节',choices:base.currentChoices,storyPlan:longRewind.storyPlan,storyState:historicalState}];
  const longBack=harness('read',longRewind);await longBack.handlers.handleRewindToRound(15);assert.equal(longBack.updates[0].storyPlan.totalSections,19);console.log('PASS rewinding a legacy long story resets a short closing deadline rather than inheriting distant future');
  const legacy=structuredClone(rewind);delete legacy.history[1].choices;const old=harness('read',legacy);await old.handlers.handleRewindToRound(1);assert.equal(old.requests.length,1);assert.ok(old.requests[0].data.signal);assert.ok(!('model' in old.requests[0].data));assert.equal(old.updates.length,1);console.log('PASS legacy history regenerates choices using server model and abort signal');
  const firstSection={...structuredClone(base),currentRound:0,history:[],storyPlan:progress.normalizeStoryPlan(null,base.prompt)};
  const checkUnlocked=h=>{
    assert.equal(h.states[3],false,'choice loading must release');
    assert.equal(h.states[4],false,'generation overlay must release');
    assert.equal(h.states[9],false,'streaming state must release');
    assert.equal(h.refs[1].current,null,'generation controller must release');
  };
  const regressions=[
    ['first choice immediately after creating round zero',async()=>{
      const h=harness('preview',structuredClone(firstSection));
      // React StrictMode replays mount setup/cleanup before the first user action.
      h.effects[0].cb()();h.effects[0].cb();h.render();
      await h.handlers.handleChoice(firstSection.currentChoices[0]);
      assert.equal(h.requests.length,2);assert.equal(h.updates.length,1);
      assert.equal(h.updates[0].currentRound,1);assert.equal(h.updates[0].history.length,1);
      assert.equal(h.updates[0].history[0].content,firstSection.currentContent);
      assert.equal(h.updates[0].history[0].choice,firstSection.currentChoices[0]);
      assert.equal(h.updates[0].currentChoices.length,3);checkUnlocked(h);
    }],
    ['legacy first section without history remains continuable',async()=>{
      const fixture=structuredClone(firstSection);delete fixture.history;
      const h=harness('preview',fixture);
      await assert.doesNotReject(()=>h.handlers.handleChoice(firstSection.currentChoices[0]));
      checkUnlocked(h);assert.equal(h.updates.length,1);
      assert.equal(h.updates[0].currentRound,1);assert.equal(h.updates[0].history.length,1);
      assert.equal(h.updates[0].history[0].content,firstSection.currentContent);
    }],
    ['cancelled generation releases locks when switching work in the same component',async()=>{
      let streamCount=0;
      const h=harness('preview',structuredClone(firstSection),{stream:data=>{
        if(streamCount++===0)return new Promise((resolve,reject)=>data.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'})),{once:true}));
        data.onChunk?.('另一作品的续写','另一作品的续写');return '另一作品的续写';
      }});
      const cleanup=h.effects[0].cb();
      const flight=h.handlers.handleChoice(firstSection.currentChoices[0]);
      assert.equal(h.requests.length,1);assert.equal(h.states[3],true);
      cleanup();await flight;
      assert.equal(h.updates.length,0);assert.equal(h.requests[0].data.signal.aborted,true);
      const nextWork={...structuredClone(firstSection),_id:'next-work',currentContent:'另一作品的开篇正文'};
      h.states[0]=nextWork;
      const nextEffects=h.effects.length;h.render('next-work');
      h.effects[nextEffects].cb();h.render();
      checkUnlocked(h);assert.equal(h.states[10],'');assert.equal(h.states[11],'');
      await h.handlers.handleChoice(nextWork.currentChoices[1]);
      assert.equal(h.requests.length,3);assert.equal(h.updates.length,1);
      assert.equal(h.writeIds[0],'next-work');assert.equal(h.updates[0].currentRound,1);
      assert.equal(h.updates[0].history[0].content,nextWork.currentContent);
      assert.equal(h.updates[0].history[0].choice,nextWork.currentChoices[1]);checkUnlocked(h);
    }],
    ['malformed first review retries the same body once without rewriting',async()=>{
      const h=harness('preview',structuredClone(firstSection),{review:(_data,index)=>index===0?'{not valid JSON':validReview()});
      await h.handlers.handleChoice(firstSection.currentChoices[0]);
      assert.equal(h.requests.filter(request=>request.kind==='stream').length,1);
      const reviews=h.requests.filter(request=>request.kind==='chat');assert.equal(reviews.length,2);
      sameJSON(reviews[0].data.userPrompt,reviews[1].data.userPrompt);
      assert.equal(h.updates.length,1);assert.equal(h.updates[0].currentRound,1);checkUnlocked(h);
    }],
    ['temporary review network failure retries only review and preserves the body',async()=>{
      const h=harness('preview',structuredClone(firstSection),{review:(_data,index)=>{if(index===0)throw Error('模拟审稿HTTP 503');return validReview();}});
      await h.handlers.handleChoice(firstSection.currentChoices[0]);
      assert.equal(h.requests.filter(request=>request.kind==='stream').length,1);
      const reviews=h.requests.filter(request=>request.kind==='chat');assert.equal(reviews.length,2);
      sameJSON(reviews[0].data.userPrompt,reviews[1].data.userPrompt);
      assert.equal(h.updates.length,1);assert.equal(h.updates[0].currentContent,'新正文');checkUnlocked(h);
    }],
    ['missing choice descriptions save a good body and preserve the known location',async()=>{
      const fixture={...structuredClone(firstSection),storyState:progress.normalizeStoryState({summary:'主角已经到达渡口',location:'已确认的渡口',latestProgress:'到达渡口'})};
      const review=validReview();delete review.choice1_desc;review.choice2_desc=null;review.choice3_desc={};review.state.location='';review.sectionTitle=null;review.endingType=null;
      const h=harness('preview',fixture,{review});await h.handlers.handleChoice(fixture.currentChoices[0]);
      assert.equal(h.requests.length,2);assert.equal(h.updates.length,1);assert.equal(h.updates[0].currentRound,1);
      assert.equal(h.updates[0].storyState.location,fixture.storyState.location);
      assert.equal(h.updates[0].currentChoices.length,3);assert.ok(h.updates[0].currentChoices.every(choice=>choice.endsWith('\n')));
      assert.ok(!JSON.stringify(h.updates[0].currentChoices).includes('undefined'));checkUnlocked(h);
    }],
    ['streaming and paused review never overwrite committed round or content',async()=>{
      let releaseReview,notifyReview;const enteredReview=new Promise(resolve=>{notifyReview=resolve;});
      const fixture={...structuredClone(firstSection),currentRound:2,history:[{round:0,content:'第一节'},{round:1,content:'第二节'}]};
      const h=harness('preview',fixture,{stream:data=>{data.onChunk?.('待审稿前半段','待审稿前半段');data.onChunk?.('后半段','待审稿完整正文');return '待审稿完整正文';},review:()=>{notifyReview();return new Promise(resolve=>{releaseReview=resolve;});}});
      const flight=h.handlers.handleChoice(fixture.currentChoices[0]);await enteredReview;
      assert.equal(h.updates.length,0);assert.equal(h.states[0],fixture);
      assert.equal(h.states[0].currentRound,2);assert.equal(h.states[0].currentContent,fixture.currentContent);
      assert.equal(h.states[10],'待审稿完整正文');assert.equal(h.states[3],true);
      assert.ok(h.novelStates.every(value=>value.currentRound===2&&value.currentContent===fixture.currentContent),'no temporary committed-state mutation before review');
      releaseReview(validReview());await flight;
      assert.equal(h.updates.length,1);assert.equal(h.updates[0].currentRound,3);
      assert.equal(h.updates[0].currentContent,'待审稿完整正文');checkUnlocked(h);
    }],
    ['repeated previous-section text is rejected despite positive model flags and keeps a persistent error',async()=>{
      let draft=0;const fixture={...structuredClone(firstSection),currentRound:2,history:[{round:0,content:'第一节'},{round:1,content:'第二节'}]};
      const lastRepeat=fixture.currentContent.split('').join(' \n');
      const h=harness('preview',fixture,{stream:data=>{const body=++draft===1?fixture.currentContent:lastRepeat;data.onChunk?.(body,body);return body;},review:validReview()});
      await h.handlers.handleChoice(fixture.currentChoices[0]);
      assert.equal(h.requests.filter(request=>request.kind==='stream').length,2);
      assert.equal(h.requests.filter(request=>request.kind==='chat').length,0,'duplicate text must fail before trusting model review');
      assert.equal(h.updates.length,0);assert.equal(h.states[0],fixture);
      sameJSON(h.states[0].history,fixture.history);assert.equal(h.states[0].currentRound,2);assert.equal(h.states[0].currentContent,fixture.currentContent);
      assert.equal(h.states[10],lastRepeat);assert.match(h.states[12],/尚未保存.*第3节/);assert.match(h.states[12],/重复/);
      h.render();assert.equal(h.states[10],lastRepeat);assert.match(h.states[12],/尚未保存/);checkUnlocked(h);
    }],
    ['non-final progress saves immediately even when the subjective chapter milestone is false',async()=>{
      const fixture={...structuredClone(firstSection),currentRound:2,history:[{round:0,content:'第一节'},{round:1,content:'第二节'}]};
      const review={...validReview(),progressMade:true,milestoneReached:false,goalResolved:false,reason:'抵达控制中心侧翼，确认妹妹位置并取得武器，但章节节点尚未完全兑现'};
      const h=harness('preview',fixture,{review});h.states[6]=0;await h.handlers.handleChoice(fixture.currentChoices[1]);
      assert.equal(h.requests.length,2);assert.equal(h.updates.length,1);assert.equal(h.updates[0].currentRound,3);
      assert.equal(h.updates[0].history.length,3);assert.equal(h.updates[0].isEnded,false);assert.equal(h.updates[0].currentChoices.length,3);
      assert.ok(h.updates[0].storyState.pacingNote.includes(review.reason));
      assert.equal(h.states[6],null,'successful save resets stale reading index to the latest section');
      assert.ok(h.updates[0].storyState.pacingNote.length<=500);assert.equal(h.states[12],'');checkUnlocked(h);
    }],
    ['one corrective non-final draft saves despite disputed progress and carries guidance into the next section',async()=>{
      let draft=0;const bodies=['第一份新稿：找到妹妹房间的位置','纠偏新稿：抵达房外并压制守卫','下一节新稿：切断束缚救出妹妹'];
      const h=harness('preview',structuredClone(firstSection),{stream:data=>{const body=bodies[draft++];data.onChunk?.(body,body);return body;},review:(_data,index)=>index<2?{...validReview(),progressMade:false,milestoneReached:false,reason:'只取得位置和武器，下一节应直接解除囚禁'}:validReview()});
      await h.handlers.handleChoice(firstSection.currentChoices[0]);
      assert.equal(h.requests.length,4);assert.equal(h.updates.length,1);assert.equal(h.updates[0].currentRound,1);
      assert.equal(h.updates[0].currentContent,bodies[1]);assert.equal(h.updates[0].history.length,1);
      const guidance=h.updates[0].storyState.pacingNote;assert.ok(guidance.includes('直接解除囚禁'));
      const correctiveRequest=h.requests.filter(request=>request.kind==='stream')[1].data;
      assert.ok(correctiveRequest.systemPrompt.includes(bodies[0]));assert.equal(h.states[12],'');checkUnlocked(h);
      h.render();await h.handlers.handleChoice(h.states[0].currentChoices[0]);
      const nextRequest=h.requests.filter(request=>request.kind==='stream')[2].data;
      assert.ok(nextRequest.userPrompt.includes('【下一节推进约束；不是已发生事实】\n'+guidance));
      const factBlock=nextRequest.userPrompt.split('【已确认剧情事实；空值表示尚未记录】\n')[1].split('\n【')[0];
      assert.equal('pacingNote' in JSON.parse(factBlock),false);assert.ok(!factBlock.includes(guidance));
      assert.equal(h.updates.length,2);assert.equal(h.updates[1].currentRound,2);assert.equal(h.updates[1].storyState.pacingNote,'');checkUnlocked(h);
    }],
    ['a full story progresses from section one through twelve and saves every selected step exactly once',async()=>{
      let nextSection=1;const h=harness('preview',structuredClone(firstSection),{stream:data=>{const body=`第${++nextSection}节独立正文`;data.onChunk?.(body,body);return body;}});
      for(let round=1;round<12;round++){
        const before=h.states[0];const selected=before.currentChoices[(round-1)%3];
        await h.handlers.handleChoice(selected);
        assert.equal(h.updates.length,round);const saved=h.updates.at(-1);
        assert.equal(saved.currentRound,round);assert.equal(saved.currentContent,`第${round+1}节独立正文`);
        assert.equal(saved.history.length,round);sameJSON(saved.history.map(section=>section.round),Array.from({length:round},(_,index)=>index));
        assert.equal(saved.history.at(-1).content,before.currentContent);assert.equal(saved.history.at(-1).choice,selected);
        assert.equal(saved.totalRounds,12);assert.equal(saved.isEnded,round===11);
        assert.equal(saved.currentChoices.length,round===11?0:3);checkUnlocked(h);h.render();
      }
      assert.equal(h.states[0].history.length+1,12);assert.equal(h.requests.length,22);
      const callCount=h.requests.length;await h.handlers.handleChoice(firstSection.currentChoices[0]);
      assert.equal(h.requests.length,callCount);assert.equal(h.updates.length,11);
    }],
  ];
  const failures=[];
  for(const [name,run] of regressions){
    try{await run();console.log('PASS '+name);}catch(error){failures.push(name);console.error('FAIL '+name+': '+error.message);}
  }
  assert.equal(failures.length,0,'Choice regressions failed: '+failures.join('; '));
})().catch(error=>{console.error(error);process.exitCode=1;});
