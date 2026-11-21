import {db} from '../../../lib/db';import {identity,fail} from '../../../lib/security';import {z} from 'zod';
const schema=z.object({tutorId:z.string(),subject:z.string().min(2).max(100),grade:z.string().min(1).max(60),message:z.string().min(1).max(2000)});
export async function POST(req:Request){const who=await identity();if(!who||who.role!=='PARENT')return fail('Parent account required',403);try{const data=schema.parse(await req.json());const tutor=await db.tutorProfile.findFirst({where:{id:data.tutorId,verification:'APPROVED'}});if(!tutor)return fail('Tutor unavailable',404);const inquiry=await db.inquiry.create({data:{...data,parentId:who.id}});
// Email is best-effort: an email outage must never erase or duplicate a saved inquiry.
try {
  const key=process.env.RESEND_API_KEY;
  const from=process.env.EMAIL_FROM;
  const tutorUser=await db.user.findUnique({where:{id:tutor.userId},select:{email:true}});
  const preview=process.env.VERCEL_ENV!=='production';
  const recipient=preview?process.env.EMAIL_TEST_TO:tutorUser?.email;
  if(key&&from&&recipient){
    const base=preview?'https://we-learn-stripe-preview.vercel.app':(process.env.APP_URL||process.env.NEXTAUTH_URL||'');
    const link=base?new URL('/dashboard#conversations',base).toString():'';
    const textBody='A new tutoring inquiry has arrived.\\nSubject: '+data.subject+'\\nStudent grade: '+data.grade+'\\n\\nSign in to WE Learn to read and respond: '+link+(preview?'\\nPreview only. Intended tutor: '+(tutorUser?.email||'unknown'):'');
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({from,to:[recipient],subject:'WE Learn: New tutoring inquiry',text:textBody}),cache:'no-store'});
    if(!response.ok)console.error('Inquiry email notification failed',response.status);
  }else console.warn('Inquiry email notification not configured');
}catch(error){console.error('Inquiry email notification error',error);}
return Response.json({id:inquiry.id},{status:201});}catch{return fail('Invalid inquiry');}}
export async function GET(){const who=await identity();if(!who)return fail('Sign in required',401);const items=who.role==='PARENT'?await db.inquiry.findMany({where:{parentId:who.id},include:{tutor:{include:{user:{select:{name:true}}}}},orderBy:{createdAt:'desc'}}):who.role==='TUTOR'?await db.inquiry.findMany({where:{tutor:{userId:who.id}},include:{parent:{select:{name:true}}},orderBy:{createdAt:'desc'}}):[];return Response.json(items);}
