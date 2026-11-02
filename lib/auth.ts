import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { db } from './db';
import bcrypt from 'bcryptjs';
export const authOptions: NextAuthOptions = {
 session:{strategy:'jwt'},
 providers:[CredentialsProvider({name:'Email and password',credentials:{email:{label:'Email',type:'email'},password:{label:'Password',type:'password'}},async authorize(credentials){
 if(!credentials?.email||!credentials.password)return null;
 const user=await db.user.findUnique({where:{email:credentials.email.toLowerCase()}});
 if(!user||!await bcrypt.compare(credentials.password,user.passwordHash))return null;
 return {id:user.id,name:user.name,email:user.email,role:user.role};
 }})],
 callbacks:{async jwt({token,user}){if(user){token.uid=user.id;token.role=(user as any).role;}return token;},async session({session,token}){(session as any).uid=token.uid;(session as any).role=token.role;return session;}},
 pages:{signIn:'/login'},secret:process.env.NEXTAUTH_SECRET
};
