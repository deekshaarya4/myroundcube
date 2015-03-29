var dateFormat=function(){var j=/d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g,k=/\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g,r=/[^-+\dA-Z]/g,d=function(a,c){a=""+a;for(c=c||2;a.length<c;)a="0"+a;return a};return function(a,c,h){var f=dateFormat;1==arguments.length&&("[object String]"==Object.prototype.toString.call(a)&&!/\d/.test(a))&&(c=a,a=void 0);a=a?new Date(a):new Date;if(isNaN(a))throw SyntaxError("invalid date");
c=""+(f.masks[c]||c||f.masks["default"]);"UTC:"==c.slice(0,4)&&(c=c.slice(4),h=!0);var b=h?"getUTC":"get",g=a[b+"Date"](),m=a[b+"Day"](),i=a[b+"Month"](),n=a[b+"FullYear"](),e=a[b+"Hours"](),o=a[b+"Minutes"](),p=a[b+"Seconds"](),b=a[b+"Milliseconds"](),l=h?0:a.getTimezoneOffset(),q={d:g,dd:d(g),ddd:f.i18n.dayNames[m],dddd:f.i18n.dayNames[m+7],m:i+1,mm:d(i+1),mmm:f.i18n.monthNames[i],mmmm:f.i18n.monthNames[i+12],yy:(""+n).slice(2),yyyy:n,h:e%12||12,hh:d(e%12||12),H:e,HH:d(e),M:o,MM:d(o),s:p,ss:d(p),
l:d(b,3),L:d(99<b?Math.round(b/10):b),t:12>e?"a":"p",tt:12>e?"am":"pm",T:12>e?"A":"P",TT:12>e?"AM":"PM",Z:h?"UTC":((""+a).match(k)||[""]).pop().replace(r,""),o:(0<l?"-":"+")+d(100*Math.floor(Math.abs(l)/60)+Math.abs(l)%60,4),S:["th","st","nd","rd"][3<g%10?0:(10!=g%100-g%10)*g%10]};return c.replace(j,function(a){return a in q?q[a]:a.slice(1,a.length-1)})}}();
dateFormat.masks={"default":"ddd mmm dd yyyy HH:MM:ss",shortDate:"m/d/yy",mediumDate:"mmm d, yyyy",longDate:"mmmm d, yyyy",fullDate:"dddd, mmmm d, yyyy",shortTime:"h:MM TT",mediumTime:"h:MM:ss TT",longTime:"h:MM:ss TT Z",isoDate:"yyyy-mm-dd",isoTime:"HH:MM:ss",isoDateTime:"yyyy-mm-dd'T'HH:MM:ss",isoUtcDateTime:"UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"};dateFormat.i18n={dayNames:"Sun Mon Tue Wed Thu Fri Sat Sunday Monday Tuesday Wednesday Thursday Friday Saturday".split(" "),monthNames:"Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec January February March April May June July August September October November December".split(" ")};
Date.prototype.format=function(j,k){return dateFormat(this,j,k)};