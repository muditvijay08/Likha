"use client";
// O2b Log in for returning members: phone and code only, no gender question. A number with no account goes on to sign-up.
import { PhoneSignIn } from "@/components/phone-sign-in";

export default function Login() { return <PhoneSignIn mode="login" />; }
