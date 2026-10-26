#!/usr/bin/env python3
"""CLI byte fixtures and an independent scalar gain/echo/PCM reference."""
import argparse,base64,hashlib,io,json,math,struct,subprocess,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];APP=ROOT/'audio_tools';OUT=APP/'evidence'
def samples(raw):
 with wave.open(io.BytesIO(raw)) as wav:
  assert (wav.getnchannels(),wav.getframerate(),wav.getsampwidth())==(1,24000,2)
  return list(struct.unpack('<'+'h'*wav.getnframes(),wav.readframes(wav.getnframes())))
def main():
 parser=argparse.ArgumentParser();parser.add_argument("--update-pins",action="store_true");args=parser.parse_args()
 pins=json.loads((OUT/"reference.json").read_text()) if (OUT/"reference.json").exists() else None
 fixtures={};reports=[]
 for preset in ['tone','pluck','noise']:
  for echo in [False,True]:
   request=json.dumps({'preset':preset,'echo':echo})
   command=['ailang','run','--package-dir','.', '--strict-bytecode','--verify-contracts','--entry','fixture','--args-json',request,'host.ail']
   result=subprocess.run(command,cwd=APP,capture_output=True,text=True,check=True,timeout=60)
   fixture=json.loads(result.stdout);r=json.loads(fixture['report']);original=base64.b64decode(fixture['original']);processed=base64.b64decode(fixture['processed'])
   assert len(processed)==r['wavBytes']<=60044
   assert hashlib.sha256(original).hexdigest()==r['originalSha256']
   assert hashlib.sha256(processed).hexdigest()==r['wavSha256']
   xs,actual=samples(original),samples(processed);assert len(xs)==len(actual)==r['frames']
   assert r['frames']==(21600 if echo else 15600)
   ring=[0.0]*3000;expected=[]
   for i,x in enumerate(xs):
    faded=(x/32768)*min(1,(i+1)/128)
    old=ring[i%3000];out=faded+(0.35*old if echo else 0)
    ring[i%3000]=faded+(0.35*old if echo else 0)
    expected.append(int(math.copysign(math.floor(abs(out)*32767+0.5),out)))
   # Original PCM16 has already been quantized; allow two s16 units against the
   # reference reconstructed from it. This is not byte parity with float input.
   largest=max(abs(a-b) for a,b in zip(actual,expected));assert largest<=2,(preset,echo,largest)
   peak=max(abs(x)/32768 for x in actual);rms=math.sqrt(sum((x/32768)**2 for x in actual)/len(actual))
   assert peak<=0.25 and abs(peak-r['peak'])<1e-12 and abs(rms-r['rms'])<1e-12
   key=f'{preset}-{str(echo).lower()}';fixtures[key]=fixture
   reports.append({'preset':preset,'echo':echo,'frames':r['frames'],'wavSha256':r['wavSha256'],'largestReferenceErrorS16':largest})
 if pins and not args.update_pins:
  assert [(r['preset'],r['echo'],r['wavSha256']) for r in reports]==[(r['preset'],r['echo'],r['wavSha256']) for r in pins['results']], 'Native byte pins changed; review before --update-pins'
 OUT.mkdir(exist_ok=True);(OUT/'native-fixtures.json').write_text(json.dumps(fixtures)+'\n')
 if args.update_pins or not pins:(OUT/'reference.json').write_text(json.dumps({'engine':'v0.54.18 strict bytecode; runtime contracts enabled','reference':'Independent scalar gain/feedback/PCM16 recurrence reconstructed from quantized original','allowedErrorS16':2,'results':reports},indent=2)+'\n')
 print('PASS: six CLI fixtures, delivered byte identities/measurements and independent scalar reference')
if __name__=='__main__':main()
