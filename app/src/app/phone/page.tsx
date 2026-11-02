"use client";
// O2 Phone OTP (sign-up). The screen itself is components/phone-sign-in.tsx, shared with /login.
import { PhoneSignIn } from "@/components/phone-sign-in";

export default function Phone() { return <PhoneSignIn mode="signup" />; }
