import crypto from "crypto"; import fs from "fs";
const KID="5A5HNSWA33", ISS="69a6de80-eb13-47e3-e053-5b8c7c11a4d1", APP="6773165027", VER=process.argv[2], PLAT=process.argv[3]??"IOS"; if(!VER){console.error("usage: node asc-submit.mjs <buildNumber> [IOS|MAC_OS]");process.exit(1)};
const key=fs.readFileSync(process.env.HOME+"/.appstoreconnect/private_keys/AuthKey_5A5HNSWA33.p8");
const b64=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const now=Math.floor(Date.now()/1000);
const unsigned=b64({alg:"ES256",kid:KID,typ:"JWT"})+"."+b64({iss:ISS,iat:now,exp:now+1100,aud:"appstoreconnect-v1"});
const sig=crypto.sign("sha256",Buffer.from(unsigned),{key,dsaEncoding:"ieee-p1363"}).toString("base64url");
const TOK=unsigned+"."+sig, B="https://api.appstoreconnect.apple.com/v1";
const api=async(p,m="GET",body)=>{const r=await fetch(p.startsWith("http")?p:B+p,{method:m,headers:{Authorization:"Bearer "+TOK,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});const t=await r.text();if(!r.ok)throw new Error(m+" "+p+" "+r.status+" "+t.slice(0,300));return t?JSON.parse(t):{}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let build;
for(let i=0;i<40;i++){const d=await api(`/builds?filter[app]=${APP}&filter[version]=${VER}&filter[preReleaseVersion.platform]=${PLAT}`);build=d.data[0];const st=build?.attributes.processingState;console.log("build "+VER+":",st??"not yet");if(st==="VALID")break;if(st==="FAILED"||st==="INVALID")process.exit(1);await sleep(30000)}
const groups=(await api(`/apps/${APP}/betaGroups`)).data;console.log("groups:",groups.map(g=>g.attributes.name+(g.attributes.publicLinkEnabled?"(public)":"")).join(", "));
for(const g of groups.filter(g=>g.attributes.name==="Testers"||g.attributes.publicLinkEnabled)){try{await api(`/betaGroups/${g.id}/relationships/builds`,"POST",{data:[{type:"builds",id:build.id}]});console.log("added to",g.attributes.name)}catch(e){console.log("add:",e.message.slice(0,120))}}
const all=(await api(`/builds?filter[app]=${APP}&filter[preReleaseVersion.platform]=${PLAT}&filter[expired]=false&include=buildBetaDetail&limit=20&sort=-uploadedDate`));
const det=Object.fromEntries((all.included||[]).map(i=>[i.id,i.attributes]));
for(const b of all.data){const s=det[b.relationships?.buildBetaDetail?.data?.id]?.externalBuildState;console.log(" ",b.attributes.version,s);
  if(b.id!==build.id&&s==="WAITING_FOR_REVIEW"){await api(`/builds/${b.id}`,"PATCH",{data:{type:"builds",id:b.id,attributes:{expired:true}}});console.log("  expired",b.attributes.version)}}
try{await api(`/betaAppReviewSubmissions`,"POST",{data:{type:"betaAppReviewSubmissions",relationships:{build:{data:{type:"builds",id:build.id}}}}});console.log("submitted "+VER+" for beta review")}catch(e){console.log("submit:",e.message.slice(0,300))}
