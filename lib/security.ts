import {getServerSession} from 'next-auth';import {authOptions} from './auth';
export async function identity(){const s=await getServerSession(authOptions);return s?{id:(s as any).uid as string,role:(s as any).role as string}:null;}
export const fail=(message:string,status=400)=>Response.json({error:message},{status});
