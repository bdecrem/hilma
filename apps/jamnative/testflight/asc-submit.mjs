// After an altool upload: wait until the build is VALID, make sure the "Public" beta
// group exists with its public TestFlight link on (limit 1000), add the build to it,
// expire any other build still waiting for review, submit for beta review, print the link.
//
//   node apps/jamnative/testflight/asc-submit.mjs <buildNumber> [IOS|MAC_OS]
//
// App record: "Jambot: talk, groove." id 6809181971 (bundle com.bartdecrem.Jambot).
import crypto from "crypto"; import fs from "fs";
const KID="5A5HNSWA33", ISS="69a6de80-eb13-47e3-e053-5b8c7c11a4d1", APP="6809181971", GROUP="Public", VER=process.argv[2], PLAT=process.argv[3]??"IOS";
if(!VER){console.error("usage: node asc-submit.mjs <buildNumber> [IOS|MAC_OS]");process.exit(1)}
const key=fs.readFileSync(process.env.HOME+"/.appstoreconnect/private_keys/AuthKey_5A5HNSWA33.p8");
const b64=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const B="https://api.appstoreconnect.apple.com/v1";
const token=()=>{const now=Math.floor(Date.now()/1000);const unsigned=b64({alg:"ES256",kid:KID,typ:"JWT"})+"."+b64({iss:ISS,iat:now,exp:now+1100,aud:"appstoreconnect-v1"});const sig=crypto.sign("sha256",Buffer.from(unsigned),{key,dsaEncoding:"ieee-p1363"}).toString("base64url");return unsigned+"."+sig};
const api=async(p,m="GET",body)=>{const r=await fetch(p.startsWith("http")?p:B+p,{method:m,headers:{Authorization:"Bearer "+token(),"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});const t=await r.text();if(!r.ok)throw new Error(m+" "+p+" "+r.status+" "+t.slice(0,400));return t?JSON.parse(t):{}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// 1. wait for processing (up to ~30 min)
let build;
for(let i=0;i<60;i++){const d=await api(`/builds?filter[app]=${APP}&filter[version]=${VER}&filter[preReleaseVersion.platform]=${PLAT}`);build=d.data[0];const st=build?.attributes.processingState;console.log("build "+VER+" ("+PLAT+"):",st??"not yet");if(st==="VALID")break;if(st==="FAILED"||st==="INVALID")process.exit(1);await sleep(30000)}
if(build?.attributes.processingState!=="VALID"){console.error("gave up waiting");process.exit(1)}

// 1b. beta review metadata (ASC 422s the first submission without a beta app
//     description + review contact). Idempotent — only fills what is empty.
const DESC="Jambot is a groovebox you talk to. Say what you want (\"techno beat at 128\", \"more swing\", \"add a dubby delay\") and it builds the drum machines, bass synths and effects for you, live. Open Controls for faders and the synth panels, Seq for the step grid, Bounce to save an MP3 or WAV, Publish to share a link on jambot.to.";
const rd=(await api(`/apps/${APP}/betaAppReviewDetail`)).data;
if(!rd.attributes.contactEmail){await api(`/betaAppReviewDetails/${rd.id}`,"PATCH",{data:{type:"betaAppReviewDetails",id:rd.id,attributes:{contactFirstName:"Bart",contactLastName:"Decrem",contactEmail:"bdecrem@gmail.com",contactPhone:"+16508989508",demoAccountRequired:true,demoAccountName:"jamtest",demoAccountPassword:"jamtest1",notes:"Sign in with the demo account (or Start a track to create one). Talk to the groovebox in the chat box, press Play."}}});console.log("review contact set")}
const locs=(await api(`/apps/${APP}/betaAppLocalizations`)).data;const en=locs.find(l=>l.attributes.locale==="en-US");
if(!en){await api(`/betaAppLocalizations`,"POST",{data:{type:"betaAppLocalizations",attributes:{locale:"en-US",description:DESC,feedbackEmail:"bdecrem@gmail.com"},relationships:{app:{data:{type:"apps",id:APP}}}}});console.log("beta description created")}
else if(!en.attributes.description){await api(`/betaAppLocalizations/${en.id}`,"PATCH",{data:{type:"betaAppLocalizations",id:en.id,attributes:{description:DESC,feedbackEmail:"bdecrem@gmail.com"}}});console.log("beta description set")}

// 2. "Public" group with the public link on
let groups=(await api(`/apps/${APP}/betaGroups`)).data;
let pub=groups.find(g=>g.attributes.name===GROUP);
if(!pub){pub=(await api(`/betaGroups`,"POST",{data:{type:"betaGroups",attributes:{name:GROUP},relationships:{app:{data:{type:"apps",id:APP}}}}})).data;console.log("created group",GROUP,pub.id)}
else console.log("group",GROUP,"exists",pub.id);
if(!pub.attributes.publicLinkEnabled||pub.attributes.publicLinkLimit!==1000){
  pub=(await api(`/betaGroups/${pub.id}`,"PATCH",{data:{type:"betaGroups",id:pub.id,attributes:{publicLinkEnabled:true,publicLinkLimitEnabled:true,publicLinkLimit:1000}}})).data;
  console.log("public link enabled, limit 1000")}
groups=(await api(`/apps/${APP}/betaGroups`)).data;
console.log("groups:",groups.map(g=>g.attributes.name+(g.attributes.publicLinkEnabled?"(public)":"")).join(", "));

// 3. add the build to Public (and any other public-link group)
for(const g of groups.filter(g=>g.attributes.name===GROUP||g.attributes.publicLinkEnabled)){try{await api(`/betaGroups/${g.id}/relationships/builds`,"POST",{data:[{type:"builds",id:build.id}]});console.log("added to",g.attributes.name)}catch(e){console.log("add:",e.message.slice(0,160))}}

// 4. one review per train: expire other builds still waiting (never an APPROVED one)
const all=await api(`/builds?filter[app]=${APP}&filter[preReleaseVersion.platform]=${PLAT}&filter[expired]=false&include=buildBetaDetail&limit=20&sort=-uploadedDate`);
const det=Object.fromEntries((all.included||[]).map(i=>[i.id,i.attributes]));
for(const b of all.data){const s=det[b.relationships?.buildBetaDetail?.data?.id]?.externalBuildState;console.log(" ",b.attributes.version,s);
  if(b.id!==build.id&&(s==="WAITING_FOR_REVIEW"||s==="WAITING_FOR_BETA_REVIEW")){await api(`/builds/${b.id}`,"PATCH",{data:{type:"builds",id:b.id,attributes:{expired:true}}});console.log("  expired",b.attributes.version)}}

// 5. submit for beta review
try{await api(`/betaAppReviewSubmissions`,"POST",{data:{type:"betaAppReviewSubmissions",relationships:{build:{data:{type:"builds",id:build.id}}}}});console.log("submitted "+VER+" for beta review")}catch(e){console.log("submit:",e.message.slice(0,400))}

console.log("public link:",pub.attributes.publicLink??"(not issued yet — appears once the first build is approved for external testing)");
