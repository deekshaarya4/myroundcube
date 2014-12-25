function carddav_share_dialog(){
  var buttons = [
    { text: rcmail.gettext('carddav.send'), click: function(){ carddav_share_dialog_validate(); } },
    { text: rcmail.gettext('carddav.cancel'), click: function() { $('#sharedialog').dialog('close'); } }
  ];
  $('#sharedialog').dialog({
    modal: true,
    title: rcmail.gettext('carddav.checkresources'),
    width: 'auto',
    buttons: buttons
  });
  return false;
}

function carddav_share_dialog_validate(){
  var failure = true
  $('.shareinvitation').each(function(){
    if($(this).prop('checked')){
      failure = false;
    }
  });
  if(failure){
    rcmail.display_message(rcmail.gettext('carddav.checkatleastoneresource'), 'error');
  }
  else{
    carddav_share_dialog_submit();
  }
}

function carddav_share_dialog_submit(){
  $('#sharedialog').dialog('close');
  rcmail.http_post('plugin.carddav_shareinvitation', unescape($('#formshareinvitation').serialize()));
  $('.shareinvitation').prop('checked', false);
}

function carddav_share_compose(){
  rcmail.open_compose_step( { _carddav_share_invitation: 1 } );
}

function carddav_server_delete(label, server_id){
  if(confirm(label, false, 'rcmail.command(\'plugin.carddav-server-delete\', ' + server_id + ', this)', false, false, false)){
    rcmail.command('plugin.carddav-server-delete', server_id, this);
  }
}

if(window.rcmail){
  rcmail.addEventListener('init', function(evt){
    $(document).keypress(function(key){
      if(key.charCode == 13){
        $('.mainaction').focus();
      }
    });
    rcmail.addEventListener('plugin.carddav_server_message', carddav_server_message);
    rcmail.addEventListener('plugin.carddav_server_success', carddav_server_success);
    rcmail.addEventListener('plugin.carddav_server_failure', carddav_server_failure);
    rcmail.addEventListener('plugin.carddav_share_compose', carddav_share_compose);
    rcmail.register_command('plugin.carddav-server-save', carddav_server_add, true);
    rcmail.register_command('plugin.carddav-server-delete', function(carddav_server_id){
      rcmail.http_post(
        'plugin.carddav-server-delete',
        '_remote=1&_carddav_server_id=' + $.base64Encode(carddav_server_id),
        rcmail.display_message(rcmail.gettext('settings_delete_loading', 'carddav'), 'loading')
      );
    }, true);
    /*
    rcmail.register_command('plugin.carddav-server-remove', function(carddav_server_id){
      rcmail.http_post(
        'plugin.carddav-server-delete',
        '_remote=1&_remove=1&_carddav_server_id=' + $.base64Encode(carddav_server_id),
        rcmail.display_message(rcmail.gettext('settings_delete_loading', 'carddav'), 'loading')
      );
    }, true);
    */
    $('#_label').keypress(carddav_server_add_enter_event);
    $('#_server_url').keypress(carddav_server_add_enter_event);
    $('#_username').keypress(carddav_server_add_enter_event);
    $('#_password').keypress(carddav_server_add_enter_event);
    $('.carddav_edit_label').focus(function(){
      var label = escape($(this).val());
      rcmail.env[$(this).attr('id')] = label;
    });
    $('.carddav_edit_label').blur(function(){
      var addressbook = $(this).attr('id');
      var label = encodeURIComponent($(this).val());
      try{
        if(rcmail.env[$(this).attr('id')] != label){
          $('#l'+ $(this).attr('id')).css('visibility', 'visible');
          rcmail.http_post(
            'plugin.carddav-label-save',
            '_remote=1&_label=' + label + '&_id=' + addressbook
          );
        }
      }
      catch(e){
      }
    });
    if($('#rcmfd_default_addressbook').get(0)){
      var html = $('#rcmfd_default_addressbook').children().get(0);
      if($(html).val() == 0){
        $(html).html(rcmail.gettext('carddav.defaultaddressbook') + ' (' + rcmail.gettext('carddav.local') + ')');
      }
    }
  });

  function carddav_server_add_enter_event(e){
    if(e.keyCode == 13){
      carddav_server_add();
    }
  }
  
  function carddav_server_readonly(obj, id){
    if(obj.src.indexOf('checked.png') > -1){
      obj.src = 'program/resources/blank.gif';
      var readonly = 0;
    }
    else{
      obj.src = 'plugins/carddav/skins/' + rcmail.env.skin + '/checked.png';
      var readonly = 1;
    }
    $('#lcarddav_addressbook'+ id).css('visibility', 'visible');
    rcmail.http_post(
      'plugin.carddav-readonly-save',
      '_remote=1&_readonly=' + readonly + '&_id=' + id
    );
  }

  function carddav_server_autocomplete(obj, id){
    if(obj.src.indexOf('checked.png') > -1){
      obj.src = 'program/resources/blank.gif';
      var autocomplete = 0;
    }
    else{
      obj.src = 'plugins/carddav/skins/' + rcmail.env.skin + '/checked.png';
      var autocomplete = 1;
    }
    $('#lcarddav_addressbook'+ id).css('visibility', 'visible');
    rcmail.http_post(
      'plugin.carddav-autocomplete-save',
      '_remote=1&_autocomplete=' + autocomplete + '&_id=' + id
    );
  }
  
  function carddav_server_subscribe(obj, id){
    if(obj.src.indexOf('checked.png') > -1){
      obj.src = 'program/resources/blank.gif';
      var subscribed = 0;
    }
    else{
      obj.src = 'plugins/carddav/skins/' + rcmail.env.skin + '/checked.png';
      var subscribed = 1;
    }
    $('#lcarddav_addressbook'+ id).css('visibility', 'visible');
    rcmail.http_post(
      'plugin.carddav-subscribe-save',
      '_remote=1&_subscribed=' + subscribed + '&_id=' + id
    );
  }
  
  function carddav_server_password(obj, id){
    var password = obj.value;
    if(!$('#keyboardInputMaster').is(':visible') && password != ''){
      $('#lcarddav_addressbook'+ id).css('visibility', 'visible');
      rcmail.http_post(
        'plugin.carddav-password-save',
        '_remote=1&_password=' + password + '&_id=' + id
      );
    }
  }
  
  function carddav_server_index(obj){
    var target_id = obj.id.replace('s', '');
    var target_idx = obj.value;
    var append = '';
    try{
      var old_target_idx = obj.className.replace('c', '');
      var old_target_id = $($('.c' + obj.value)).get(0).id.replace('s', '');
      append = '&_old_target_id=' + old_target_id + '&_old_target_idx=' + old_target_idx;
      $('#lcarddav_addressbook'+ old_target_id).css('visibility', 'visible');
    }
    catch(e){
    }
    $('.c' + obj.value).val(old_target_idx);
    $('#lcarddav_addressbook'+ target_id).css('visibility', 'visible');
    rcmail.http_post(
      'plugin.carddav-idx-save',
      '_remote=1&_target_id=' + target_id + '&_target_idx=' + target_idx + append
    );
  }

  function carddav_server_add(){
    try{
      var input_label = rcube_find_object('_label');
      var input_url = rcube_find_object('_server_url');
      var input_username = rcube_find_object('_username');
      var input_password = rcube_find_object('_password');
      var input_read_only = rcube_find_object('_read_only');
      var input_autocomplete = rcube_find_object('_autocomplete');
      var input_idx = rcube_find_object('_idx');
      if(input_label.value == '' || input_url.value == ''){
        if(input_label.value == '' && input_url.value == ''){
          // display nothing
        }
        else{
          rcmail.display_message(rcmail.gettext('settings_empty_values', 'carddav'), 'error');
        }
      }
      else{
        rcmail.http_post(
          'plugin.carddav-server-save',
          '_remote=1&_idx=' + $.base64Encode(input_idx.value) + '&_label=' + $.base64Encode(input_label.value) + '&_server_url=' + input_url.value + '&_username=' + $.base64Encode(input_username.value) + '&_password=' + $.base64Encode(input_password.value)  + '&_read_only=' + $.base64Encode(input_read_only.checked === true ? '1' : '0') + '&_autocomplete=' + $.base64Encode(input_autocomplete.checked === true ? '1' : '0'),
          rcmail.display_message(rcmail.gettext('settings_init_server', 'carddav'), 'loading')
        );
        parent.parent.getIFRAMEDiv("addressbook");
        var frame = parent.parent.rcmail.env.tabbed_target;
        var target = frame.replace("#tabbed_", "tabbed_frame_");
        var loc = window.top.frames[target].document.location.href;
        var temp = loc.split("_task=");
        loc = "./?_task=" + temp[1];
        temp = loc.split("&_s=");
        loc = temp[0] + "&_onload=no&_s=" + new Date().getTime();
        window.top.frames[target].document.location.href = loc;
        window.setTimeout("parent.tabbed_syncTitle()", 1000);
      }
    }
    catch(e){
    }
  }

  function carddav_server_message(response){
    if(response.check){
      $('#carddav_server_list').slideUp();
      if(rcmail.env.skin == 'larry'){
        var target = $('table.propform').get(0);
      }
      else{
        var target = $('table').get(0);
      }
      $(target).html('<tbody><tr><td style="width: auto;">' + response.server_list + '</td></tr></tbody>');
      $("table.propform td").css("width", "auto");
      $('#carddav_server_list').slideDown();
      var type = 'confirmation';
      if(response.type){
        type = response.type;
      }
      if(response.tabbed){
        if(typeof parent.parent.getIFRAMEDiv == "function"){
          try{
            parent.parent.getIFRAMEDiv("addressbook");
            var frame = parent.parent.rcmail.env.tabbed_target;
            var target = frame.replace("#tabbed_", "tabbed_frame_");
            var loc = window.top.frames[target].document.location.href;
            var temp = loc.split("_task=");
            loc = "./?_task=" + temp[1];
            temp = loc.split("&_s=");
            loc = temp[0] + "&_onload=no&_s=" + new Date().getTime();
            window.top.frames[target].document.location.href = loc;
            window.setTimeout("parent.tabbed_syncTitle()", 1000);
          }
          catch(e){
          }
        }
      }
      rcmail.display_message(response.message, type);
    }
    else{
      rcmail.display_message(response.message, 'error');
    }
  }
  
  function carddav_server_success(response){
    window.setTimeout("$('.myrc_loading_small').css('visibility', 'hidden');", 1000);
    if(response.tabbed){
      if(typeof parent.parent.getIFRAMEDiv == "function"){
        try{
          parent.parent.getIFRAMEDiv("addressbook");
          var frame = parent.parent.rcmail.env.tabbed_target;
          var target = frame.replace("#tabbed_", "tabbed_frame_");
          var loc = window.top.frames[target].document.location.href;
          var temp = loc.split("_task=");
          loc = "./?_task=" + temp[1];
          temp = loc.split("&_s=");
          loc = temp[0] + "&_onload=no&_s=" + new Date().getTime();
          window.top.frames[target].document.location.href = loc;
          window.setTimeout("parent.tabbed_syncTitle();", 1000);
        }
        catch(e){
        }
      }
    }
    rcmail.display_message(response.message, 'confirmation');
  }

  function carddav_server_failure(response){
    window.setTimeout("$('.myrc_loading_small').css('visibility', 'hidden');", 1000);
    parent.rcmail.display_message(response.message, 'error');
    if(response.reload){
      document.location.reload();
    }
  }
}