import { readFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiVersion='2026-03-10';
const pause=ms=>new Promise(done=>setTimeout(done,ms));
function publicUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw Error('Pages URL must be a public HTTPS URL.');return u;}
function options({repository,sha,artifactId,token}){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||''))throw Error('Invalid repository.');
 if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Invalid build commit.');
 if(!/^\d+$/.test(String(artifactId||'')))throw Error('Invalid artifact ID.');
 if(!token)throw Error('Missing repository token.');
}
export async function publishPages({repository,sha,artifactId,token,getOidcToken,fetchImpl=fetch,wait=pause,maxPolls=60,intervalMs=5000,log=console.log}){
 options({repository,sha,artifactId,token});
 const base='https://api.github.com/repos/'+repository;
 async function request(path,{method='GET',body}={}){
  let response;try{response=await fetchImpl(base+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':apiVersion,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw Error('GitHub API request failed.');}
  if(!response.ok)throw Error('GitHub Pages API returned HTTP '+response.status+(response.headers?.get('x-github-request-id')?' (request '+response.headers.get('x-github-request-id')+')':''));
  return response.json();
 }
 const config=await request('/pages');
 log('Pages configuration: '+JSON.stringify({build_type:config.build_type,source:config.source,html_url:config.html_url,status:config.status,public:config.public,cname:config.cname}));
 if(config.build_type!=='workflow')throw Error('Pages publishing source must be GitHub Actions (workflow).');
 const url=publicUrl(config.html_url).href;
 const oidc=await getOidcToken();
 const deployment=await request('/pages/deployments',{method:'POST',body:{artifact_url:base+'/actions/artifacts/'+artifactId+'/zip',pages_build_version:sha,oidc_token:oidc}});
 if(!/^[A-Za-z0-9_-]+$/.test(String(deployment.id||'')))throw Error('Pages API returned no deployment ID.');
 for(let n=0;n<maxPolls;n++){
  const status=await request('/pages/deployments/'+encodeURIComponent(deployment.id));
  if(status.status==='succeed'){log('Pages deployment succeeded.');return url;}
  if(['deployment_failed','deployment_content_failed','deployment_cancelled','deployment_lost','failed','cancelled'].includes(status.status))throw Error('Pages deployment ended: '+status.status);
  await wait(intervalMs);
 }
 throw Error('Timed out waiting for Pages publication.');
}
export async function verifySite({url,expected,fetchImpl=fetch,wait=pause,maxChecks=12,intervalMs=5000}){
 const root=publicUrl(url);if(!root.pathname.endsWith('/'))root.pathname+='/';
 for(let n=0;n<maxChecks;n++){
  try{
   // No repository or OIDC credentials are sent to the public site.
   const [page,manifest]=await Promise.all([fetchImpl(root.href,{headers:{'Cache-Control':'no-cache'}}),fetchImpl(new URL('release.json',root).href,{headers:{'Cache-Control':'no-cache'}})]);
   if(page.ok && manifest.ok){const [html,actual]=await Promise.all([page.text(),manifest.json()]);if(html.includes('<title>Patchlab') && actual.source_commit===expected.source_commit && actual.generated_at===expected.generated_at && JSON.stringify(actual.files)===JSON.stringify(expected.files))return root.href;}
  }catch{}
  if(n+1<maxChecks)await wait(intervalMs);
 }
 throw Error('The public URL did not serve this Patchlab release.');
}
async function oidcFromEnvironment(env){
 const url=new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL||'');
 if(url.protocol!=='https:'||!url.hostname.endsWith('.actions.githubusercontent.com'))throw Error('Invalid GitHub OIDC endpoint.');
 let response;try{response=await fetch(url,{headers:{Authorization:'Bearer '+env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});}catch{throw Error('GitHub OIDC request failed.');}
 if(!response.ok)throw Error('GitHub OIDC request failed with HTTP '+response.status);
 const body=await response.json();if(!body.value)throw Error('GitHub OIDC response had no token.');return body.value;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const env=process.env;let url;
  if(process.argv.includes('--verify-only'))url=await verifySite({url:env.PAGE_URL,expected:JSON.parse(await readFile('release.json','utf8')),maxChecks:60});
  else url=await publishPages({repository:env.GITHUB_REPOSITORY,sha:env.GITHUB_SHA,artifactId:env.PAGES_ARTIFACT_ID,token:env.GH_TOKEN,getOidcToken:()=>oidcFromEnvironment(env)});
  if(env.GITHUB_OUTPUT)await appendFile(env.GITHUB_OUTPUT,'page_url='+url+'\n');
  console.log(process.argv.includes('--verify-only')?'Verified live release: '+url:'Published Pages deployment: '+url);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
