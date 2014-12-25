// find me: ToDo
/*

   As the filename states this stuff has to be
   ported to a javascript class ...
   
   Move $.trigger('click') to GUI js
   
*/
 
var default_starttime = '08:00';
var planner_items = 0;
var js_time_formats = new Array();
var js_date_formats = new Array();
var planner_request = new Array();
var blink_timer;

(function($)
{
	$.fn.blink = function(options)
	{
		var defaults = { delay:500 };
		var options = $.extend(defaults, arguments[0] || {});
		
		return this.each(function()
		{
			var obj = $(this);
			blink_timer = setInterval(function()
			{
				if($(obj).css("visibility") == "visible")
				{
					$(obj).css('visibility','hidden');
				}
				else
				{
					$(obj).css('visibility','visible');
				}
			}, options.delay);
		});
	}
}(jQuery));

function planner_overlay_toggle(state){
  $('#planner_help').hide();
  if(state){
    window.clearTimeout(rcmail.env.planner_timeout);
    rcmail.env.planner_timeout = window.setTimeout('planner_timeout()', 5000);
    if(planner_items > 0){
      $('#overlay').show();
    }
  }
  else{
    $('#overlay').hide();
    window.clearTimeout(rcmail.env.planner_timeout);
  }
}

function planner_timeout(){
  if($('#overlay').is(":visible")){
    rcmail.display_message(rcmail.gettext('planner.errorsaving'), 'error');
    planner_overlay_toggle(false);
    rcmail.http_post('plugin.planner_retrieve', '_p=' + rcmail.env.planner_items);
  }
}

function planner_init(birthdays){
    // sort list
    planner_sort();
    // set counts
    $('#planner_items_list').hide();
    rcmail.env.planner_counts = new Array();
    var views = new Array('all', 'today', 'tomorrow', 'week', 'starred', 'done', 'deleted', 'overdue');
    $('#planner_items_list').hide();
    for(var i in views){
      planner_show(views[i]);
    }
    $('#planner_items_list').show();
    if(birthdays)
      planner_dialog_adjust_gui(birthdays);
}
 
function planner_dialog(){
  if(!rcmail.env.planner_dialog_initialized){
    $dialogContent = $('#planner_input');
    var buttons = {};
    buttons[rcmail.gettext('planner.search')] = function(e) {
      e.preventDefault();
      rcmail.env.planner_search_mode = true;
      planner_overlay_toggle(true);
      planner_search();
      planner_overlay_toggle(false);
      $('.flink').css('font-weight', 'normal');
    };
    buttons[rcmail.gettext('planner.plan')] = function(e) {
      e.preventDefault();
      planner_dialog_submit();
    };
    buttons[rcmail.gettext('planner.cancel')] = function() {
      $dialogContent.dialog('close');
    };
    var title = rcmail.gettext('planner.new');
    if($('#planner_mode').val() == 'edit'){
      title = rcmail.gettext('planner.edit');
    }
    $dialogContent.dialog({
      modal: ($('#dialog_modal').html() === 'true'),
      title: title,
      width: parseInt($('#dialog_width').html()),
      height: parseInt($('#dialog_height').html()),
      zIndex: parseInt($('#dialog_zIndex').html()),
      close: function() {
        planner_dialog_reset_gui();
      },
      buttons: buttons
    }).show();
    rcmail.env.planner_dialog_initialized = true;
  }
  else{
    $('#planner_input').dialog('open');
  }
  var i = -1;
  $('.ui-dialog-buttonset').children().each(function(){
    i++;
    switch(i){
      case 0:
        if($('#planner_mode').val() == 'new'){
          $(this).focus();
          $(this).css('font-weight', 'bold');
        }
        else{
          $(this).css('font-weight', 'normal');
        }
        break;
      case 1:
        if($('#planner_mode').val() == 'edit'){
          $(this).focus();
          $(this).css('font-weight', 'bold');
        }
        else{
          $(this).css('font-weight', 'normal');
        }
        break;
      case 2:
        $(this).css('font-weight', 'normal');
        break;
    }
  });
  $('#planner_help').hide();
}

function planner_search(){
  planner_items = 0;
  $("#planner_items_list li").hide();
  var filter = $.trim($.trim($("#planner_preview_date").text()) + ' ' + $.trim($("#planner_preview_time").text()) + ' ' + $.trim($("#planner_preview_text").text()));
  var sfilter = filter;
  while(filter.indexOf(' ') > -1){
    filter = filter.replace(' ', '');
  }
  while(filter.indexOf('.') > -1){
    filter = filter.replace('.', '');
  }
  while(filter.indexOf(':') > -1){
    filter = filter.replace(':', '');
  }
  $("#planner_items_list li").each(function(){
    var text = $(this).text();
    while(text.indexOf(' ') > -1){
      text = text.replace(' ', '');
    }
    while(text.indexOf('.') > -1){
      text = text.replace('.', '');
    }
    while(text.indexOf(':') > -1){
      text = text.replace(':', '');
    }
    if(text.search(new RegExp(filter, "i")) < 0){
      $(this).hide();
    }
    else{
      planner_items ++;
      $(this).show();
    }
  });
  $('#dfilter').attr('title', sfilter);
  if(sfilter.length > 18)
    sfilter = sfilter.substr(0,15) + ' ...';
  $('#dfilter').html(rcmail.gettext('planner.searchresult') + ' &raquo;<b>' + sfilter + '</b>&laquo;');
  planner_dialog_adjust_gui();
  $('#items_count').text(planner_items + '/' + (parseInt($('#all_count').text()) + parseInt($('#done_count').text()) + parseInt($('#deleted_count').text())));
  $('.lcontrol').css('font-weight', 'normal');
  var label = rcmail.gettext('planner.matches_plural');
  if(planner_items == 1)
    label = rcmail.gettext('planner.matches');
  $('#planner_input').dialog('option', 'title', rcmail.gettext('planner.search') + ': ' + planner_items + ' ' + label);
}

function planner_datetimepicker(){
  var ampm = false;
  if(!js_time_formats[rcmail.env.rc_time_format]){
    rcmail.env.rc_time_format = 'HH:MM';
  }
  if(!js_date_formats[rcmail.env.rc_date_format]){
    rcmail.env.rc_date_format = 'dd.mm.yy';
  }
  if(
    js_time_formats[rcmail.env.rc_time_format].substr(js_time_formats[rcmail.env.rc_time_format].length - 2).toLowerCase() == 'tt'
  ){
    ampm = true;
  }
  $("#planner_datetimepicker").datetimepicker({
    timeText: rcmail.gettext('planner.timeText'),
    hourText: rcmail.gettext('planner.hourText'),
    minuteText: rcmail.gettext('planner.minuteText'),
    minDate: new Date(Math.round(new Date().getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000),
    showButtonPanel: false,
    onSelect: function(dateText){
      dateText = planner_dialog_ampm_replace(dateText) + ' ';
      var val = $('#planner_raw').val();
      var repl = planner_dialog_parse($('#planner_raw').val());
      if(repl[0])
        val = $.trim(val.replace(repl[0], ''));
      if(repl[1])
        val = $.trim(val.replace(repl[1], ''));
      $("#planner_raw").val(dateText + val);
      planner_dialog_preview(val, dateText);
    },
    timeFormat: js_time_formats[rcmail.env.rc_time_format],
    dateFormat: js_date_formats[rcmail.env.rc_date_format],
    ampm: ampm,
    defaultDate: new Date(Math.round((new Date().getTime() + 60 * 60 * 1000) / (15 * 60 * 1000)) * 15 * 60 * 1000)
  });
}

function planner_dialog_submit(){
  $('#planner_help').hide();
  if($.trim($('#planner_text').val()) == ''){
    return;
  }
  var append = '';
  if($('#planner_starred').prop('checked') === true)
    append = '&_starred=1';
  if($('#planner_done').prop('checked') === true)
    append = append + '&_done=1';
  if($('#planner_deleted').prop('checked') === true)
    append = append + '&_deleted=1';
  if($('#planner_datetime').val() != '')
    append = append + '&_d=' + encodeURIComponent($('#planner_datetime').val());
  if($('#planner_mode').val() == 'new'){
    rcmail.http_post('plugin.planner_new', '_t=' + encodeURIComponent($('#planner_text').val()) + '&_d=' + encodeURIComponent($('#planner_datetime').val()) + append);
  }
  else{
    rcmail.http_post('plugin.planner_edit', '_id=' + $("#planner_id").val() + '&_c=' + $('#planner_created').val() + '&_t=' + encodeURIComponent($('#planner_text').val()) + append);
  }
  planner_overlay_toggle(true);
  $('#planner_help').hide();
  $('#planner_raw').val("");
  $('#planner_mode').val('new');
  $('#planner_id').val('');
  $('#planner_datetimepicker').datetimepicker('setDate', (new Date()));
  $('#planner_input').dialog('close');
}

function planner_keypress(){
  var l = Math.min(rcmail.gettext('planner.tomorrow').length, rcmail.gettext('planner.today').length);
  for(var i = 0; i<= l; i++){
    if(rcmail.gettext('planner.tomorrow').substr(i,1) != rcmail.gettext('planner.today').substr(i,1)){
      break;
    }
  }
  i = Math.max(i+1, 1);
  $(document).keyup(function(e){
    if($('#planner_raw').val().length >= i){
      if($('#planner_raw').val().toLowerCase() == rcmail.gettext('planner.today').substr(0, $('#planner_raw').val().length).toLowerCase()){
        var now = Math.round((new Date().getTime() + 60 * 60 * 1000) / (15 * 60 * 1000)) * 15 * 60 * 1000;
        $('#planner_datetimepicker').datetimepicker('setDate', new Date(now));
        var time = new Date(now).format(js_time_formats[rcmail.env.rc_time_format]);
        time = planner_dialog_ampm_replace(time);
        $('#planner_autocomplete').show();
        $('#planner_autocomplete_content').html(rcmail.gettext('planner.today').toLowerCase() + ' ' + time + ' ');
      }
      else{
        if($('#planner_raw').val().toLowerCase() == rcmail.gettext('planner.tomorrow').substr(0, $('#planner_raw').val().length).toLowerCase()){
          var now = Math.round(new Date().getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000 + 86400000;
          $('#planner_datetimepicker').datetimepicker('setDate', new Date(now));
          var time = new Date(now).format(js_time_formats[rcmail.env.rc_time_format]);
          time = planner_dialog_ampm_replace(time);
          $('#planner_autocomplete').show();
          $('#planner_autocomplete_content').html(rcmail.gettext('planner.tomorrow').toLowerCase() + ' ' + time + ' ');
        }
        else{
          $('#planner_autocomplete').hide();
          $('#planner_autocomplete_content').html('');
        }
      }
    }
    var ret = planner_dialog_parse($('#planner_raw').val());
    if(ret[1] && ret[0]){
      var time = ret[1] + ' ' + ret[0];
    }
    else{
      var time = false;
    }
    var text = $('#planner_raw').val();
    if(ret[2])
      text = ret[2];
    planner_dialog_preview(text, time);
  });
  $(document).keypress(function(key){
    if(key.charCode == 13){
      if($('#planner_autocomplete').is(":visible")){
        $('#planner_autocomplete').trigger('click');
      }
      else{
        key.preventDefault();
        planner_overlay_toggle(true);
        if($('#planner_mode').val() == 'new'){
          planner_search();
          planner_overlay_toggle(false);
        }
        else{
          planner_dialog_submit();
        }
      }
    }
    else if(key.charCode != 13){
      var typed = String.fromCharCode(key.charCode);
      try{
        if($('#planner_input').dialog("isOpen") !== true){
          planner_dialog();
        }
      }
      catch(e){
        planner_dialog();
      }
      if(typed){
        $('#planner_raw').focus();
      }
    }
  });
  $(document).keydown(function(key){
    if(key.keyCode == 40){
      if($('#planner_autocomplete').is(":visible")){
        key.preventDefault();
        $('#planner_autocomplete').trigger('click');
      }
    }
  });
}

function planner_dialog_parse(val){
  var ret = new Array();
  var temparr = new Array();
  var temp = new Array();
  var matches = new Array();
  var b, dateFormat, separator, day_part, month_part, year_part, reg;
  temparr = $("#planner_raw").val().split(' ');
  if(temparr.length < 2)
    return ret;
  b = temparr[0];
  // today
  if(temparr[0].toLowerCase() == rcmail.gettext('planner.today').toLowerCase()){
    ret[0] = planner_dialog_time(temparr[1]);
    ret[1] = b;
    ret[2] = val.replace(b,'').replace(ret[0],'');
  }
  else if(temparr[0].toLowerCase() == rcmail.gettext('planner.tomorrow').toLowerCase()){
    ret[0] = planner_dialog_time(temparr[1]);
    ret[1] = b;
    ret[2] = val.replace(b,'').replace(ret[0],'');
  }
  else{
    // +5
    matches = temparr[0].match(/\+(([0-9][0-9])|([0-9]))/);
    if(matches && matches[0]){
      temparr = val.split(matches[0]);
      ret[0] = planner_dialog_time(temparr[1]);
      ret[1] = b;
      ret[2] = val.replace(b,'').replace(ret[0],'');
    }
    else{
      temparr[0] = temparr[0] + ' ';
      dateFormat = $("#planner_datetimepicker").datepicker("option", "dateFormat");
      dateFormat = dateFormat.replace(/dd/i, 'd');
      dateFormat = dateFormat.replace(/mm/i, 'm');
      dateFormat = dateFormat.replace(/yy/i, 'y');
      separator = planner_dialog_date_separator();
      temp = dateFormat.split(separator);
      separator = '[\\' + separator + ']';
      reg = '';
      for(var i in temp){
        reg = reg + temp[i];
        if(i < temp.length - 1)
          reg = reg + separator;
      }
      day_part = '(0[1-9]|[12][0-9]|3[01])';
      month_part = '(0[1-9]|1[012])';
      year_part = '((20)[0-9][0-9])';
      reg = reg.replace('d', day_part);
      reg = reg.replace('m', month_part);
      reg = reg.replace('y', year_part);
      reg = '/' + reg + '/';
      // full date
      matches = temparr[0].match(eval(reg));
      if(matches && matches[0]){
        temparr = val.split(matches[0]);
        ret[0] = planner_dialog_time(temparr[1]);
        ret[1] = b;
        ret[2] = val.replace(b,'').replace(ret[0],'');
      }
      else{
        // day and month only
          reg = '';
        for(var i in temp){
          if(temp[i] != 'y')
            reg = reg + temp[i] + separator;
        }
        reg = reg.replace('d', day_part);
        reg = reg.replace('m', month_part);
        reg = '/' + reg + '/';
        reg = reg.replace(']/', '\\s]/');
        matches = temparr[0].match(eval(reg));
        if(matches && matches[0]){
          temparr = val.split(matches[0]);
          ret[0] = planner_dialog_time(temparr[1]);
          ret[1] = b;
          ret[2] = val.replace(b,'').replace(ret[0],'');
        }
      }
    }
  }
  return ret;
}

function planner_dialog_time(val){
  var matches = new Array();
  var ret = 'default';
  val = ' ' + val + ' ';
  matches = val.match(/([\s]([0-9])|(0[0-9])|(1[0-9]|2[0-3])):([0-5][0-9](am\s|pm\s|a\s|p\s|h\s|\s))/);
  if(matches && matches[0]){
    ret =  matches[0];
  }
  else{
    matches = val.match(/([\s]([0-9])|(0[0-9])|(1[0-9]|2[0-3]))(h\s|am\s|pm\s|a\s|p\s|\s)/i);
    if(matches && matches[0]){
      ret = matches[0];
    }
  }
  return $.trim(ret);
}

function planner_dialog_date_separator(dateFormat){
  var separator;
  var temparr = new Array();
  if(!dateFormat)
    dateFormat = $("#planner_datetimepicker").datepicker("option", "dateFormat");
  separator = '/';
  temparr = dateFormat.match(/[^a-z0-9]/i);
  if(temparr && temparr[0])
    separator = temparr[0];
  else
    separator = false
  return separator;
}

function planner_dialog_ampm_replace(datetime){
  datetime = datetime.replace(/\sam/i, 'am');
  datetime = datetime.replace(/\spm/i, 'pm');
  return datetime;
}

function planner_dialog_format_reduce(format){
  var temparr = new Array();
  separator = planner_dialog_date_separator(format);
  temparr = format.split(separator);
  for(var i in temparr){
    format = format.replace(temparr[i], temparr[i].substr(0, 1).toLowerCase());
  }
  return format;
}

function planner_dialog_datetime_display(datetime, dateFormat){
  var dpformat, separator, date_part, time_part, posy, posm, posd;
  var dt = new Array();
  var temparr = new Array();
  var temp = new Array();
  if(datetime.indexOf('default') > -1){
    datetime = datetime.replace('default', default_starttime);
  }
  dpformat = planner_dialog_format_reduce($("#planner_datetimepicker").datepicker("option", "dateFormat"));
  if(!dateFormat)
    dateFormat = dpformat
  dt = datetime.split(' ');
  date_part = dt[0];
  time_part = dt[1];
  dateFormat = planner_dialog_format_reduce(dateFormat);
  if(datetime.substr(0,1) != '+'){
    separator = planner_dialog_date_separator(dpformat);
    temparr = dpformat.split(separator);
    for(var i in temparr){
      switch(temparr[i]){
        case 'y':
          posy = i;
          break;
        case 'm':
          posm = i;
          break;
        case 'd':
          posd = i;
      }
    }
    separator = planner_dialog_date_separator(date_part);
    if(separator){
      temp = date_part.split(separator);
      if(temp.length < 3 && posy == 0){
        date_part = new Date().getFullYear() + separator + temp[0] + separator + temp[1];
        temp = date_part.split(separator);
      }
      datetime = dateFormat.replace('m', temp[posm]);
      datetime = datetime.replace('d', temp[posd]);
      if(!temp[posy])
        temp[posy] = new Date().getFullYear();
      datetime = datetime.replace('y', temp[posy]) + ' ' + time_part;
    }
  }
  return datetime;
}

function planner_dialog_datetime(time){
  var temparr = new Array();
  var temp = new Array();
  var ret = new Array();
  var m, d, h, min;
  time = planner_dialog_datetime_display(time, 'm/d/y');
  temparr = time.split(' ');
  if(temparr[0] && temparr[1]){
    var min = '';
    var temp = new Array();
    if(temparr[1].indexOf(':') > -1){
      for(var i=0; i< temparr.length; i++){
        if(temparr[i].substr(0,1) == 0){
          temparr[i] = temparr[i].substr(1);
        }
      }
      temp = temparr[1].split(':');
      if(parseInt(temp[0]) < 12 && temparr[1].toLowerCase().indexOf('p') > -1){
        temparr[1] = Math.min(parseInt(temp[0]) + 12, 23) + ':' + temp[1];
      }
      else{
        temparr[1] = temp[0] + ':' + temp[1];
      }
    }
    else{
      if(parseInt(temparr[1]) < 12 && temparr[1].toLowerCase().indexOf('p') > -1){
        temparr[1] = Math.min(parseInt(temparr[1]) + 12, 23) + ':00';
      }
      else{
        temparr[1] = temparr[1] + ':00';
      }
    }
    temp = temparr[1].split(':');
    if(temp[0].length < 2)
      temp[0] = '0' + temp[0];
    if(temp[1].length < 2)
      temp[1] = '0' + temp[1];
    temparr[1] = temp[0] + ':' + temp[1];
    ret['time_format'] = js_time_formats[rcmail.env.rc_time_format]
    temp = time.split(' ');
    ret['date_formatted'] = temp[0];
    if(temparr[0].toLowerCase() == rcmail.gettext('planner.today').toLowerCase()){
      datetime = new Date();
      datetime = (datetime.getMonth() + 1) + '/' + datetime.getDate() + '/' + datetime.getFullYear() + ' ' + temparr[1];
    }
    else if(temparr[0].toLowerCase() == rcmail.gettext('planner.tomorrow').toLowerCase()){
      datetime = new Date(new Date().getTime() + 86400000);
      datetime = (datetime.getMonth() + 1) + '/' + datetime.getDate() + '/' + datetime.getFullYear() + ' ' + temparr[1];
    }
    else if(temparr[0].substr(0,1) == '+'){
      datetime = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
      datetime = Math.round(datetime.getTime() / 3600000) * 3600000 + parseInt(temparr[0]) * 86400000;
      temp = temparr[1].split(':');
      for(var i=0; i< temp.length; i++){
        if(temp[i].substr(0,1) == 0){
          temp[i] = temp[i].substr(1);
        }
      }
      datetime = datetime + (parseInt(temp[0]) * 60 * 60 * 1000) + (parseInt(temp[1]) * 60 * 1000);
    }
    else{
      datetime = new Date(temparr[0] + ' ' + temparr[1]).getTime();
    }
    ret['date'] = temparr[0];
    ret['time'] = temparr[1];
    if(datetime){
      ret['date_stamp'] = datetime;
      datetime = new Date(datetime);
      ret['time_formatted'] = datetime.format(ret['time_format']);
      m = (datetime.getMonth() + 1) + '';
      if(m.length < 2)
        m = '0' + m;
      d = datetime.getDate() + '';
      if(d.length < 2)
        d = '0' + d;
      h = datetime.getHours() + '';
      if(h.length < 2)
        h = '0' + h;
      min = datetime.getMinutes() + '';
      if(min.length < 2)
        min = '0' + min;
      ret['datetime'] = datetime.getFullYear() + "-" + m + '-' + d + ' ' + h + ':' + min + ':00';
      datetime = datetime.format('dd mmm');
      temp = datetime.split(' ');
      ret['date_short_locale'] = temp[0] + ' ' + rcmail.gettext('planner.' + temp[1]);
    }
  }
  return ret;
}

function planner_html_sanitize(text){
  text = text.replace('<', '&lt;').replace('>', '&gt;');
  return text;
}

function planner_dialog_preview(text, time){
  var datetime = new Array();
  $('#planner_text').val($.trim(text));
  $('#planner_preview_text').html($.trim(planner_html_sanitize(text)));
  if(time){
    text = $.trim(time) + ' ' + $.trim(text);
    datetime = planner_dialog_datetime($.trim(time));
    if(datetime['date_stamp']){
      $('#planner_datetimepicker').datetimepicker('setDate', new Date(datetime['date_stamp']));
      $('#planner_datetime').val(datetime['datetime']);
      $('#planner_preview_date').html(planner_html_sanitize(datetime['date_short_locale']));
      $('#planner_preview_time').html(planner_html_sanitize(datetime['time_formatted']));
      $('#planner_preview_text').addClass('datetime');
    }
    else{
      $('#planner_raw').val(datetime[0] + ' ');
      $('#planner_preview_text').html(planner_html_sanitize(time + ' ' + text));
      $('#planner_text').val(time + ' ' + text);
      $('#planner_datetime').val('');
    }
  }
  else{
    $('#planner_preview_text').removeClass('datetime');
    $('#planner_preview_time').html('');
    $('#planner_preview_date').html('');
    $('#planner_datetime').val('');
  }
}

function planner_dialog_edit(obj, text, time){
  planner_dialog_reset_gui();
  var created = obj.find('.created').val();
  $('#planner_input').dialog('option', 'title', rcmail.gettext('planner.edit'));
  planner_dialog_preview(text, time);
  if(time){
    time = planner_dialog_datetime_display(time);
    text = time + ' ' + text;
  }
  $("#planner_raw").val(text);
  $("#planner_mode").val('edit');
  $("#planner_id").val(obj.parent().parent().attr("id"));
  $("#planner_created").val(created);
  if(obj.parent().parent().children().next().attr('class') == 'delete'){
    $("#planner_done").prop('checked', true);
    $("#planner_preview_done").removeClass('pdelete');
    $("#planner_preview_done").addClass('pdone');
  }
  if(obj.parent().parent().children().attr('class') == 'star'){
    $("#planner_starred").prop('checked', true);
    $("#planner_preview_star").removeClass('pnostar');
    $("#planner_preview_star").addClass('pstar');
  }
  if($('#controls').val() == 'deleted'){
    $("#planner_deleted").prop('checked', true);
    $("#planner_done").prop('checked', false);
    $("#planner_preview_done").removeClass('pdone');
    $("#planner_preview_done").addClass('pdelete');
  }
  planner_dialog();
}

function planner_dialog_reset_gui(){
  $("#planner_raw").val('');
  $('#planner_autocomplete_content').html('');
  $('#planner_autocomplete').hide();
  $("#planner_done").prop('checked', false);
  $("#planner_preview_done").removeClass('pdone');
  $("#planner_starred").prop('checked', false);
  $("#planner_preview_star").removeClass('pstar');
  $("#planner_preview_star").addClass('pnostar');
  $("#planner_deleted").prop('checked', false);
  $("#planner_preview_done").removeClass('pdelete');
  $('#planner_id').val('');
  try{
    if($('#planner_input').dialog("isOpen") !== true){
      $('#planner_input').dialog('option', 'title', rcmail.gettext('planner.new'));
    }
  }
  catch(e){
    planner_dialog();
    $('#planner_input').dialog('option', 'title', rcmail.gettext('planner.new'));
  }
  $('#planner_mode').val('new');
  $('#planner_datetime').val('');
  $('#planner_text').val('');
  $('#planner_preview_text').html('');
  $('#planner_preview_time').html('');
  $('#planner_preview_date').html('');
  $('#planner_datetimepicker').datetimepicker('setDate', new Date(Math.round((new Date().getTime() + 60 * 60 * 1000) / (15 * 60 * 1000)) * 15 * 60 * 1000));
  $('.ui-dialog-buttonset').children().blur();
  $("#planner_raw").focus();
}

function planner_dialog_adjust_gui(){
  if(rcmail.env.planner_filter == 'birthdays'){
    $('.nobirthday').hide();
  }
  else{
    $('.nobirthday').show();
  }
  planner_items = 0;
  $('#planner_items_list li').each(function(){
    if($(this).css('display') != 'none'){
      planner_items ++;
    }
  });
  if(rcmail.env.planner_counts && rcmail.env.planner_counts[rcmail.env.planner_items]){
    $('#items_count').text(planner_items + '/' + rcmail.env.planner_counts[rcmail.env.planner_items]);
  }
  else{
    $('#items_count').text(planner_items);
  }
  planner_show_overdue_count();
  if($('#control_bar_position').html() == 'right'){
    var posx = $('#planner_items').offset().left + $('#planner_items_list').width() - $('#control_bar').width() - parseInt($('#control_bar_fudge').html());
  }
  else if($('#control_bar_position').html() == 'left'){
    var posx = $('#planner_items').offset().left;
  }
  else if($('#control_bar_position').html() == 'center'){
    var posx = $('#planner_items').offset().left;
    $('#control_bar').css('width', $('#planner_items_list').width());
    $('#control_bar').html('<center>' + $('#control_bar').html() + '</center>');
  }
  if(posx){
    $('#control_bar').css('left', posx);
  }
  $('#control_bar').show();
  if($('#filter_bar_position').html() == 'variable'){
    var posy = $('#planner_items_list').offset().top + $('#planner_items_list').height();
    posy = Math.min(posy, $(window).height() - parseInt($('#filter_bar_fudge').html()));
    $('#filter_bar').css('top', posy);
    var posx = $('#planner_items').offset().left + $('#planner_items_list').width() - $('#expunge_bar').width() - parseInt($('#control_bar_fudge').html());
    $('#expunge_bar').css('top', posy);
    $('#expunge_bar').css('left', posx);
  }
  if(rcmail.env.planner_filter && rcmail.env.planner_filter != rcmail.env.planner_last_filter){
    rcmail.env.planner_last_filter = rcmail.env.planner_filter;
    planner_save_prefs();
    $('#f' + rcmail.env.planner_filter).trigger('click');
  }
}

function planner_save_prefs(){
  if(rcmail.env.planner_items && rcmail.env.planner_items != rcmail.env.planner_saved_view){
    rcmail.env.planner_saved_view = rcmail.env.planner_items;
    planner_request[0] = '_v=' + rcmail.env.planner_items + '&';
  }
  if(rcmail.env.planner_filter && rcmail.env.planner_filter != rcmail.env.planner_saved_filter){
    rcmail.env.planner_saved_filter = rcmail.env.planner_filter;
    planner_request[1] = '_f=' + rcmail.env.planner_filter + '&';
  }
  if(planner_request[0] || planner_request[1]){
    var request = '';
    if(planner_request[0])
      request = request + planner_request[0];
    if(planner_request[1])
      request = request + planner_request[1];
    request = request.substr(0, request.length -1);
    if(request != rcmail.env.planner_saved_request){
      rcmail.env.planner_saved_request = request;
      rcmail.http_post('plugin.planner_prefs', request);
    }
  }
}

function planner_show(view){
  if(typeof eval('planner_show_' + view) == 'function'){
    $('#planner_items').css('overflow', 'hidden');
    if(view != 'all' && view != 'today' && view != 'tomorrow' && view != 'week'){
      $('#birthdays_count').hide();
      $('#bdlabel').hide();
      $('#cbirthdays').hide();
    }
    else{
      $('#birthdays_count').show();
      $('#bdlabel').show();
      $('#cbirthdays').show();
    }
    planner_overlay_toggle(true);
    eval('planner_show_' + view)();
    planner_overlay_toggle(false);
    $('#planner_items').css('overflow', 'auto');
    rcmail.env.planner_select = view;
  }
}

function planner_show_init(){
  planner_filter('all');
}

function planner_show_all(){
  $('#planner_items_list li').show();
  $('.delete').each(function(){
    $(this).parent().hide();
  });
  $('.remove').each(function(){
    $(this).parent().hide();
  });
  planner_filter('all');
}

function planner_show_overdue(){
  $('.datetime').each(function(){
    var d = new Date($(this).prev().prev().val());
    if(d){
      var t = new Date();
      d = d.getTime();
      t = t.getTime();
      if(d < t){
        $(this).parent().parent().show();
      }
      else{
        $(this).parent().parent().hide();
      }
    }
  });
  $('.nodate').each(function(){
    $(this).parent().parent().hide();
  });
  $('.delete').each(function(){
    $(this).parent().hide();
  });
  $('.remove').each(function(){
    $(this).parent().hide();
  });
  $('.birthday').each(function(){
    $(this).parent().hide();
  });
  planner_filter('overdue');
}

function planner_show_today(){
  $('.nodate').each(function(){
    $(this).parent().parent().show();
  });
  $('.datetime').each(function(){
    var d = new Date($(this).prev().prev().val());
    if(d){
      var t = new Date();
      var t = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59);
      var y = new Date(new Date(t).getTime() - 86400000);
      y = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59);
      d = d.getTime();
      t = t.getTime();
      y = y.getTime();
      if(d > t || d <= y){
        $(this).parent().parent().hide();
      }
      else{
        $(this).parent().parent().show();
      }
    }
  });
  $('.delete').each(function(){
    $(this).parent().hide();
  });
  $('.remove').each(function(){
    $(this).parent().hide();
  });
  planner_filter('today');
}

function planner_show_tomorrow(){
  $('.nodate').each(function(){
    $(this).parent().parent().show();
  });
  $('.datetime').each(function(){
    var d = new Date($(this).prev().prev().val());
    if(d){
      var t = new Date();
      var t = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59);
      var y = new Date(new Date(t).getTime() + 86400000);
      y = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59);
      d = d.getTime();
      t = t.getTime();
      y = y.getTime();
      if(d > t && d <= y){
        $(this).parent().parent().show();
      }
      else{
        $(this).parent().parent().hide();
      }
    }
  });
  $('.delete').each(function(){
    $(this).parent().hide();
  });
  $('.remove').each(function(){
    $(this).parent().hide();
  });
  planner_filter('tomorrow');
}

function planner_show_week(){
  $('.nodate').each(function(){
    $(this).parent().parent().show();
  });
  $('.datetime').each(function(){
    var d = new Date($(this).prev().prev().val());
    if(d){
      var t = new Date();
      var t = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59);
      var b = t.getDay();
      if(b == 0)
        b = 7;
      t = new Date(t.getTime() - b * 86400000);
      var y = new Date(new Date(t).getTime() + 7 * 86400000);
      y = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59);
      d = d.getTime();
      t = t.getTime();
      y = y.getTime();
      if(d > t && d <= y){
        $(this).parent().parent().show();
      }
      else{
        $(this).parent().parent().hide();
      }
    }
  });
  $('.delete').each(function(){
    $(this).parent().hide();
  });
  $('.remove').each(function(){
    $(this).parent().hide();
  });
  planner_filter('week');
}

function planner_show_starred(){
  $('#planner_items_list li').show();
  $('.delete').each(function(){
    $(this).parent().hide();
  });
  $('.remove').each(function(){
    $(this).parent().hide();
  });
  $('.birthday').each(function(){
    $(this).parent().hide();
  });
  $('.nostar').each(function(){
    $(this).parent().hide();
  });
  planner_filter('starred');
}

function planner_show_done(){
  $('.done').each(function(){
    $(this).parent().hide();
  });
  $('.remove').each(function(){
    $(this).parent().hide();
  });
  $('.birthday').each(function(){
    $(this).parent().hide();
  });
  $('.nostar').each(function(){
    $(this).parent().hide();
  });
  $('.star').each(function(){
    $(this).parent().hide();
  });
  $('.delete').each(function(){
    $(this).parent().show();
  });
  planner_filter('done');
}

function planner_show_deleted(){
  $('#planner_items_list li').hide();
  $('.remove').each(function(){
    $(this).parent().show();
  });
  planner_filter('deleted');
}

function planner_show_overdue_count(){
  var count = 0;
  $('.datetime').each(function(){
    var d = new Date($(this).prev().prev().val());
    if(d){
      var t = new Date();
      d = d.getTime();
      t = t.getTime();
      if(d < t && !$(this).parent().hasClass('birthday') && $(this).parent().prev().hasClass('done')){
        count ++;
      }
    }
  });
  if(count > 0 && !rcmail.env.planner_blink){
    rcmail.env.planner_blink = true;
    $('#overdue_count').blink(
      {
        delay: 1500
      }
    );
  }
  if(count == rcmail.env.planner_counts['overdue']){
    clearInterval(blink_timer);
    rcmail.env.planner_blink = false;
    $('#overdue_count').css('visibility','visible');
  }
  else{
    $('#overdue_count').html(count);
  }
  if(count > rcmail.env.planner_counts['overdue']){
    // HTML5
    try {
      var elem = $('<audio src="plugins/planner/sound.wav" />');
      elem.get(0).play();
    }
    // old method
    catch (e) {
      var elem = $('<embed id="sound" src="plugins/planner/sound.wav" hidden=true autostart=true loop=false />');
      elem.appendTo($('body'));
      window.setTimeout("$('#sound').remove()", 5000);
    }
  }
}

function planner_sort(){
  $('#planner_items_list li').sortElements(function(a, b){
    var dt1 = $(a).children().next().next().children().next().next().next().val();
    if(!dt1){
      dt1 = $(a).children().next().children().next().next().next().val();
      if(!dt1)
        dt1 = 0;
    }
    dt1 = new Date(dt1).getTime();
    var dt2 = $(b).children().next().next().children().next().next().next().val();
    if(!dt2){
      dt2 = $(b).children().next().children().next().next().next().val();
      if(!dt2)
        dt2 = 0;
    }
    var text1 = $(a).children().next().next().children().next().next().next().text();
    if(!text1)
      text1 = $(a).children().next().next().children().text();
    var text2 = $(b).children().next().next().children().next().next().next().text();
    if(!text2)
      text2 = $(b).children().next().next().children().text();
    var created1 = '0000000000000';
    var created2 = '0000000000000';
    if(dt1 == 0){
      // show newest ToDo on top of list
      created1 = new Date().getTime() - parseInt($(a).children().next().next().children().find('.created').val()) + '';
      created2 = new Date().getTime() - parseInt($(b).children().next().next().children().find('.created').val()) + '';
    }
    while(created1.length < 13)
      created1 = '0' + created1;
    while(created2.length < 13)
      created2 = '0' + created2;
    dt2 = new Date(dt2).getTime();
    dt1 = dt1 + created1 + text1.toLowerCase();
    dt2 = dt2 + created2 + text2.toLowerCase();
    return dt1 > dt2 ? 1 : -1;
  });
}

function planner_filter(view){
  if(view){
    planner_items = 0;
    $('#planner_items_list li').each(function(){
      if($(this).css('display') != 'none'){
        planner_items ++;
      }
    });
    $('#' + view + '_count').html(planner_items);
    rcmail.env.planner_counts[view] = planner_items;
  }
  switch(rcmail.env.planner_filter){
    case 'all':
      break;
    case 'todos':
      $('.datetime').each(function(){
        $(this).parent().parent().hide();
      });
      break;
    case 'plans':
      $('.nodate').each(function(){
        $(this).parent().parent().hide();
      });
      break;
    case 'birthdays':
      $('.nodate').each(function(){
        $(this).parent().parent().hide();
      });
      $('.datetime').each(function(){
        if(!$(this).parent().hasClass('birthday')){
          $(this).parent().parent().hide();
        }
      });
      break;
  }
  if(rcmail.env.planner_items != 'deleted'){
    $('#expunge_bar').hide();
  }
  else if(planner_items > 1){
    $('#expunge_bar').show();
  }
  window.setTimeout("planner_dialog_adjust_gui()",100);
}

function planner_drag(){

  // sortable
  $('#planner_items_list').sortable({
    revert: false,
    containment: "window",
    scroll: false,
    helper: "clone",
    cursor: "move",
    items: 'li.drag_nodate',
    stop: function(event, ui){
      var id = ui.item.find('.drag_id').val();
      var created = $('#' + id).prev().find('.created').val();
      var prev = $('#' + id).prev();
      if(prev.hasClass('drag_datetime') || prev.hasClass('drag_birthday')){
        planner_sort();
      }
      else{
        if(!created)
          created = new Date().getTime();
        else
          created = created - 1000;
        $('#' + id).prev().find('.created').val(created);
        planner_overlay_toggle(true);
        rcmail.http_post('plugin.planner_created', '_id=' + id + '&_c=' + Math.round(created / 1000));
      }
      planner_drag();
    },
    appendTo: '#planner_drag_list',
    zIndex: 999999
  });
  
  // sticky notes drag & drop (function is bundled with sticky_notes plugin)
  if(typeof planner_drag_notes == 'function'){
    planner_drag_notes();
  }
  // calendar events drag & drop (function is bundled with calendar plugin)
  if(typeof planner_drag_events == 'function'){
    planner_drag_events();
  }
  // birthdays drag & drop (function is bundled with compose_in_taskbar plugin)
  if(typeof planner_drag_birthdays == 'function'){
    planner_drag_birthdays();
  }
  else{
    var $list = $('#planner_items'),
    $mail_icon = $('.button-mail');

    $("li.drag_birthday", $list).draggable({
      cancel: "a.ui-icon",
      revert: "invalid",
      containment: "window",
      scroll: false,
      helper: "clone",
      cursor: "move",
      appendTo: '#planner_drag_list',
      zIndex: 999999
    });

    $mail_icon.droppable({
      accept: "#planner_items_list > li.drag_birthday",
      activeClass: "ui-state-highlight",
      tolerance: "touch",
      drop: function(event,ui){
        var bd = new Date(ui.draggable.find('.time').next().val()).getTime() + 3600000 * 7;
        bd = Math.round(bd / 1000);
        if(new Date(bd * 1000) < new Date()){
          bd = new Date(bd * 1000);
          bd = new Date((bd.getMonth() + 1) + '/' + bd.getDate() + '/' + (bd.getFullYear() + 1) + ' 08:00:00').getTime();
          bd = Math.round(bd / 1000);
        }
        var append = '&_date=' + bd;
        var email = ui.draggable.find('.drag_email').val();
        var oldtask = rcmail.env.task;
        rcmail.env.task='mail';
        if(rcmail.env.compose_newwindow){
          composenewwindowcommandcaller('compose', email + '?subject=' + rcmail.gettext('planner.happybirthday') + append, this);
        }
        else{
          rcmail.command('compose', email + '?subject=' + rcmail.gettext('planner.happybirthday') + append, this);
        }
        $('#planner_help').hide();
        rcmail.env.task = oldtask;
      }
    });
  }
  
  var $list = $('#planner_items');
  $("li.drag_birthday", $list).draggable({
    cancel: "a.ui-icon",
    revert: "invalid",
    containment: "window",
    scroll: false,
    helper: "clone",
    cursor: "move",
    appendTo: '#planner_drag_list',
    zIndex: 999999
  });
  $("li.drag_datetime", $list).draggable({
    cancel: "a.ui-icon",
    revert: "invalid",
    containment: "window",
    scroll: false,
    helper: "clone",
    cursor: "move",
    appendTo: '#planner_drag_list',
    zIndex: 999999
  });
  
  var $target = $('.ddate');
  $target.droppable({
    accept: function(d){
      if(d.children().hasClass('edit')){ 
          return true;
      }
    },
    activeClass: "ui-state-highlight",
    tolerance: "pointer",
    drop: function(event,ui){
      planner_overlay_toggle(true);
      var text = ui.draggable.find('.datetime').text();
      if(!text)
        text = ui.draggable.text();
      var id = $(this).attr('id');
      var base = new Date(Math.round((new Date().getTime() + 60 * 60 * 1000) / (15 * 60 * 1000)) * 15 * 60 * 1000);
      var time = ui.draggable.find('.datetime').prev().prev().val();
      if(time){
        var temparr = time.split(' ');
        temparr = temparr[1].split(':');
        time = temparr[0] + ':' + temparr[1];
      }
      else{
        time = base.getHours() + ':' + base.getMinutes();
      }
      switch(id){
        case 'today':
        case 'ctoday':
          rcmail.http_post('plugin.planner_edit', '_id=' + ui.draggable.find('.drag_id').val() + '&_t=' + encodeURIComponent(text) + '&_d=' + encodeURIComponent(new Date(base).format('mm/dd/yyyy') + ' ' + time));
          break;
        case 'tomorrow':
        case 'ctomorrow':
          base = new Date(new Date(base).getTime() + 86400000);
          time = ui.draggable.find('.datetime').prev().prev().val();
          if(time){
            var temparr = time.split(' ');
            temparr = temparr[1].split(':');
            time = temparr[0] + ':' + temparr[1];
          }
          else{
            time = base.getHours() + ':' + base.getMinutes();
          }
          rcmail.http_post('plugin.planner_edit', '_id=' + ui.draggable.find('.drag_id').val() + '&_t=' + encodeURIComponent(text) + '&_d=' + encodeURIComponent(new Date(base).format('mm/dd/yyyy') + ' ' + time));
          break;
        case 'week':
        case 'cweek':
          planner_overlay_toggle(false);
          ui.draggable.find('.nodate').trigger('click');
          $('#planner_datetimepicker').datepicker('setDate', base);
          $('.ui-state-highlight').trigger('click');
          break;
      }
    }
  });
  
  $('#planner_items_list').disableSelection();
  $('.date').attr('title', rcmail.gettext('planner.remove_date'));
  $('.date').on('mousedown', function(event) {
    if(event.which == 3){ // && !$(this).parent().hasClass('birthday')){
      var text = $(this).parent().find('.datetime').text();
      var id = $(this).parent().find('.drag_id').val();
      planner_overlay_toggle(true);
      var created = $(this).parent().find('.created').val();
      $(this).parent().parent().removeClass('today');
      $(this).parent().parent().removeClass('highlight');
      $(this).parent().parent().removeClass('drag_datetime');
      $(this).parent().parent().addClass('drag_nodate');
      rcmail.http_post('plugin.planner_edit', '_id=' + id + '&_c=' + created + '&_t=' + encodeURIComponent(text));
    }
  });
}