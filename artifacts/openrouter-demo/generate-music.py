import math,wave,struct,random
from pathlib import Path
rate=44100;duration=41.1;rng=random.Random(24)
# Original quiet ambient score: warm sustained chords and a soft repeating bell.
chords=[(146.832,174.614,220.0,261.626),(130.813,164.814,195.998,246.942),(110.0,130.813,164.814,195.998),(130.813,174.614,220.0,261.626)]
notes=[440,523.251,659.255,523.251,391.995,493.883,587.33,493.883]
out=Path('artifacts/openrouter-demo/background-original.wav')
with wave.open(str(out),'wb') as w:
 w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate)
 block=bytearray()
 for i in range(int(rate*duration)):
  t=i/rate;section=int(t/8);u=t%8
  cross=min(u/1.6,1);ch=chords[section%4];prev=chords[(section-1)%4]
  values=[]
  for side in (0,1):
   pad=0
   for pitches,weight in ((ch,cross),(prev,1-cross)):
    for j,f in enumerate(pitches):
     detune=1+(.00065 if side else -.00065)
     pad+=weight*(math.sin(2*math.pi*f*detune*t+j*.7)+.18*math.sin(2*math.pi*2*f*detune*t))*.012
   beat=int(t/0.8);age=t%0.8;f=notes[beat%len(notes)]
   bell=(math.sin(2*math.pi*f*age)+.15*math.sin(2*math.pi*2.002*f*age))*math.exp(-age*5)*min(age/.02,1)*.018
   pulse=math.sin(2*math.pi*55*t)*math.exp(-(t%1.6)*9)*.014
   fade=min(t/2.5,1,max(0,(duration-t)/3))
   values.append(int(max(-1,min(1,(pad+bell+pulse)*fade))*32767))
  block.extend(struct.pack('<hh',*values))
  if len(block)>65536:w.writeframes(block);block.clear()
 if block:w.writeframes(block)
print(out)
