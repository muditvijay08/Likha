import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui's class helper: join classes, later Tailwind classes win. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
