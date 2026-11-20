import { calculateHillshade } from "./terrain.js";
self.addEventListener("message", event => {
 const {width,height,values}=event.data??{};
 if(!Number.isInteger(width)||!Number.isInteger(height)||!(values instanceof ArrayBuffer)||values.byteLength!==width*height*2){self.postMessage({ok:false});return;}
 const elevation=new Int16Array(values),shades=new Uint8Array(width*height),dx=360/width;
 for(let y=0;y<height;y++){const latitude=90-(y+.5)/height*180,north=Math.max(0,y-1),south=Math.min(height-1,y+1);
  for(let x=0;x<width;x++){const index=y*width+x;if(elevation[index]<0){shades[index]=128;continue;}
   const west=elevation[y*width+((x-1+width)%width)],east=elevation[y*width+((x+1)%width)];
   const shade=calculateHillshade(west,east,elevation[north*width+x],elevation[south*width+x],latitude,dx);
   shades[index]=Math.round(Math.max(0,Math.min(1,(shade-.48)/1.04))*255);
  }
 }
 self.postMessage({ok:true,width,height,shades},[shades.buffer]);
});
