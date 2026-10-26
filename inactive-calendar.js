(() => {
  'use strict';
  const tg=window.Telegram?.WebApp;
  const API='https://tg-admin-bot-1k1g.onrender.com/api/webapp/inactive-calendar';
  let selectedStart='',selectedEnd='',submitting=false;
  const daysBack=new Date();daysBack.setDate(daysBack.getDate()-2);
  tg?.ready();tg?.expand();
  tg?.MainButton?.setParams({text:'ПОДТВЕРДИТЬ ВЫБОР',color:'#3182ce',text_color:'#ffffff',is_visible:false});
  const picker=flatpickr('#calendar-container',{
    inline:true,mode:'range',locale:'ru',dateFormat:'d.m.Y',minDate:daysBack,
    onChange(dates,_text,instance){
      if(submitting)return;
      selectedStart=dates[0]?instance.formatDate(dates[0],'d.m.Y'):'';
      selectedEnd=dates.length?instance.formatDate(dates[1]||dates[0],'d.m.Y'):'';
      document.getElementById('summary').style.display=selectedStart?'block':'none';
      if(selectedStart){document.getElementById('dates-val').textContent=selectedStart===selectedEnd?selectedStart:`с ${selectedStart} по ${selectedEnd}`;document.getElementById('days-val').textContent=`${Math.round(((dates[1]||dates[0])-dates[0])/86400000)+1} дн.`;tg?.MainButton?.show();tg?.MainButton?.enable();}
      else tg?.MainButton?.hide();
    },
  });
  window.selectToday=()=>{const today=new Date();picker.setDate([today,today],true);};
  window.selectDays=days=>{const start=new Date(),end=new Date();end.setDate(start.getDate()+Number(days)-1);picker.setDate([start,end],true);};
  async function submit(){
    if(submitting||!selectedStart)return;
    // Keyboard-button Mini Apps legitimately have no initData.  Their sendData
    // travels through Telegram and is accepted only in the active bot FSM state.
    if(!tg||tg.platform==='unknown'){window.alert('Откройте календарь из заявления в Telegram-боте.');return;}
    submitting=true;tg.MainButton.disable();tg.MainButton.showProgress();
    try {
      const payload={start_date:selectedStart,end_date:selectedEnd};
      if(tg.initDataUnsafe?.query_id){
        if(!tg.initData)throw new Error('Откройте календарь заново из заявления.');
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
        try{const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':tg.initData},body:JSON.stringify(payload),signal:controller.signal,cache:'no-store'});const result=await response.json();if(!response.ok||result.status!=='success')throw new Error(result.message||'Не удалось подтвердить выбор дат.');}finally{clearTimeout(timer);}
      }else tg.sendData(JSON.stringify(payload));
      tg.HapticFeedback?.notificationOccurred?.('success');tg.close();
    }catch(error){const message=error.name==='AbortError'?'Сервер отвечает слишком долго. Повторите подтверждение.':error.message;if(tg.showAlert)tg.showAlert(message);else window.alert(message);}
    finally{submitting=false;tg.MainButton.hideProgress();tg.MainButton.enable();}
  }
  tg?.onEvent('mainButtonClicked',submit);
  window.addEventListener('pagehide',()=>tg?.offEvent?.('mainButtonClicked',submit),{once:true});
})();
