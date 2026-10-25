import type { Command } from './contracts'
export type VoiceStatus='connecting'|'active'|'ended'|'cancelled'|'error'|'confirmed'
export type TranscriptLine={id:string;role:'agent'|'driver';text:string;at:string;receivedAt?:string}
export type VoiceReply=Omit<Extract<Command,{command:'receive_driver_reply'}>,'command'>
export type VoiceSession={id:string;incidentId:string;orderId:string;status:VoiceStatus;version:number;createdAt:string;updatedAt:string;expiresAt:string;simulationTime:string;sourceRefs:string[];context:string;missing:string[];conversationId?:string;transcript:TranscriptLine[];reply?:VoiceReply;confirmedAt?:string;error?:string}
