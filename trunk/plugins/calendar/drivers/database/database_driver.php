<?php

/**
 * Database driver for the Calendar plugin
 *
 * @version @package_version@
 * @author Lazlo Westerhof <hello@lazlo.me>
 * @author Thomas Bruederli <bruederli@kolabsys.com>
 * @author Roland 'rosali' Liebl <dev-team@myroundcube.com>
 *
 * Copyright (C) 2010, Lazlo Westerhof <hello@lazlo.me>
 * Copyright (C) 2012, Kolab Systems AG <contact@kolabsys.com>
 * Copyright (C) 2014, MyRoundcube.com <dev-team@myroundcube.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
 
class database_driver extends calendar_driver
{
  const DB_DATE_FORMAT = 'Y-m-d H:i:s';

  // features this backend supports
  public $alarms = true;
  public $attendees = true;
  public $freebusy = false;
  public $attachments = true;
  public $alarm_types = array('DISPLAY', 'EMAIL');

  private $rc;
  private $cal;
  private $cache = array();
  protected $calendars = array();
  private $calendar_ids = '';
  private $free_busy_map = array('free' => 0, 'busy' => 1, 'out-of-office' => 2, 'outofoffice' => 2, 'tentative' => 3);
  private $sensitivity_map = array('public' => 0, 'private' => 1, 'confidential' => 2);
  private $server_timezone;
  
  private $db_events = 'vevent';
  private $db_calendars = 'calendars';
  private $db_attachments = 'vevent_attachments';
  private $db_users = 'users';
  
  private $cache_slots_args;
  private $cache_slots = array();

  /**
   * Default constructor
   */
  public function __construct($cal)
  {
    $this->cal = $cal;
    $this->rc = $cal->rc;
    $this->server_timezone = new DateTimeZone(date_default_timezone_get());
    
    if (class_exists('calendar_plus')) {
      $this->freebusy = true;
    }
    
    // load library classes
    require_once(INSTALL_PATH . 'plugins/libcalendaring/lib/Horde_Date_Recurrence.php');
    
    // read database config
    $db = $this->rc->get_dbh();
    $this->db_events = $this->rc->config->get('db_table_events', $db->table_name($this->db_events));
    $this->db_calendars = $this->rc->config->get('db_table_calendars', $db->table_name($this->db_calendars));
    $this->db_attachments = $this->rc->config->get('db_table_attachments', $db->table_name($this->db_attachments));
    $this->db_users = $this->rc->config->get('db_table_users', $db->table_name($this->db_users));
    
    $this->_read_calendars();
  }

  /**
   * Read available calendars for the current user and store them internally
   */
  protected function _read_calendars()
  {
    if (!empty($this->rc->user->ID)) {
      $calendar_ids = array();
      $result = $this->rc->db->query(
        "SELECT *, calendar_id AS id FROM " . $this->db_calendars . "
         WHERE user_id=?
         ORDER BY name",
         $this->rc->user->ID
      );
      while ($result && ($arr = $this->rc->db->fetch_assoc($result))) {
        $arr['showalarms'] = intval($arr['showalarms']);
        $arr['tasks']      = intval($arr['tasks']);
        $arr['active']     = $arr['subscribed'] ? true : false;
        $arr['name']       = html::quote($arr['name']);
        $arr['listname']   = html::quote($arr['name']);
        $arr['readonly']   = $arr['readonly'] ? true : false;
        $this->calendars[$arr['calendar_id']] = $arr;
        $calendar_ids[] = $this->rc->db->quote($arr['calendar_id']);
      }
      $this->calendar_ids = join(',', $calendar_ids);
    }
  }

  /**
   * Get a list of available calendars from this source
   *
   * @param bool $active   Return only active calendars
   * @param bool $personal Return only personal calendars
   *
   * @return array List of calendars
   */
  public function list_calendars($active = false, $personal = false)
  {
    // attempt to create a default calendar for this user
    if (get_class($this) == 'database_driver' && empty($this->calendars)) {
      if ($this->create_calendar(array('name' => 'Default', 'color' => 'cc0000')))
        $this->_read_calendars();
    }

    $calendars = $this->calendars;

    // filter active calendars
    if ($active) {
      foreach ($calendars as $idx => $cal) {
        if (!$cal['active']) {
          unset($calendars[$idx]);
        }
      }
    }

    return $calendars;
  }
  
  /**
   * Add default (pre-installation provisioned) calendar. If calendars from 
   * same url exist, insertion does not take place. Same for previously
   * deleted calendars.
   *
   * @param array $props
   *    name: Calendar name
   *    color: Events color
   *    showalarms: Display alarms
   *    tasks: Handle tasks
   *    freebusy: Allow freebusy requests
   *    ical_user: User name
   *    ical_pass: Password
   *    ical_url: URL
   * @return bool false on creation error, true otherwise
   *    
   */
   public function insert_default_calendar($props) {
    
    $success = true;
    
    if ($props['driver'] == 'database') {
      $removed = $this->rc->config->get('calendar_database_removed', array());
      if (!isset($removed[$props['name']])) {
        $found = false;
        foreach ($this->list_calendars() as $cal) {
          if ($props['name'] == $cal['name']) {
            $found = true;
          }
        }
        if (!$found) {
          $success = $this->create_calendar($props);
          $this->_read_calendars();
        }
      }
    }
    
    return $success;
  }

  /**
   * Callback function to produce driver-specific calendar create/edit form
   *
   * @param string Request action 'form-edit|form-new'
   * @param array  Calendar properties (e.g. id, color)
   * @param array  Edit form fields
   *
   * @return string HTML content of the form
   */
  public function calendar_form($action, $calendar, $formfields)
  {
    $cal_id = $calendar['id'];
        
    if($this->freebusy)
    {
      $enabled = $this->calendars[$cal_id]['freebusy'];
      $input_freebusy = new html_checkbox(array(
          "name" => "freebusy",
          "title" => $this->cal->gettext("allowfreebusy"),
          "id" => "chbox_freebusy",
          "value" => 1,
      ));
        
      $formfields['freebusy'] = array(
        "label" => $this->cal->gettext('freebusy'),
        "value" => $input_freebusy->show($enabled?1:0),
        "id" => "freebusy",
       );
    }
    
    $enabled = $this->calendars[$cal_id]['tasks'];
    $input_tasks = new html_checkbox(array(
      "name" => "tasks",
      "id" => "chbox_tasks",
      "value" => 1,
    ));
    
    $formfields["tasks"] = array(
      "label" => $this->cal->gettext("tasks"),
      "value" => $input_tasks->show($enabled ? 1 : 0),
      "id" => "tasks",
    );

    return parent::calendar_form($action, $calendar, $formfields);
  }



  /**
   * Create a new calendar assigned to the current user
   *
   * @param array Hash array with calendar properties
   *    name: Calendar name
   *   color: The color of the calendar
   * @return mixed ID of the calendar on success, False on error
   */
  public function create_calendar($prop)
  {
    $result = $this->rc->db->query(
      "INSERT INTO " . $this->db_calendars . "
       (user_id, name, color, showalarms, tasks, freebusy, readonly)
       VALUES (?, ?, ?, ?, ?, ?, ?)",
       $this->rc->user->ID,
       $prop['name'],
       $prop['color'],
       $prop['showalarms']?1:0,
       $prop['tasks']?1:0,
       $prop['freebusy']?1:0,
       $prop['readonly']?1:0
    );

    if ($result)
      return $this->rc->db->insert_id($this->db_calendars);
    
    return false;
  }

  /**
   * Update properties of an existing calendar
   *
   * @see calendar_driver::edit_calendar()
   */
  public function edit_calendar($prop)
  {
    $query = $this->rc->db->query(
      "UPDATE " . $this->db_calendars . "
       SET   name = ?, color = ?, showalarms = ?, tasks = ?, freebusy = ?
       WHERE calendar_id=?
       AND   user_id=?",
      $prop['name'],
      $prop['color'],
      $prop['showalarms']?1:0,
      $prop['tasks']?1:0,
      $prop['freebusy']?1:0,
      $prop['id'],
      $this->rc->user->ID
    );
    
    return $this->rc->db->affected_rows($query);
  }

  /**
   * Set active/subscribed state of a calendar
   *
   * @see calendar_driver::subscribe_calendar()
   */
  public function subscribe_calendar($prop)
  {
    $query = $this->rc->db->query(
      "UPDATE " . $this->db_calendars . "
       SET subscribed = ? WHERE calendar_id = ?
       AND user_id = ?",
       $prop['active'],
       $prop['id'],
       $this->rc->user->ID
    );
    
    return $this->rc->db->affected_rows($query);
  }

  /**
   * Delete the given calendar with all its contents
   *
   * @see calendar_driver::remove_calendar()
   */
  public function remove_calendar($prop, $driver = 'database')
  {
    if (!$this->calendars[$prop['id']])
      return false;

    // events and attachments will be deleted by foreign key cascade

    $query = $this->rc->db->query(
      "DELETE FROM " . $this->db_calendars . "
       WHERE calendar_id = ?",
       $prop['id']
    );
    
    if ($driver == 'database') {
      $removed = $this->calendars[$prop['id']]['name'];
      $removed = array_merge($this->rc->config->get('calendar_database_removed', array()), array($removed => time()));
      $this->rc->user->save_prefs(array('calendar_database_removed' => $removed));
    }
    
    return $this->rc->db->affected_rows($query);
  }

  /**
   * Add a single event to the database
   *
   * @param array Hash array with event properties
   * @see calendar_driver::new_event()
   */
  public function new_event($event)
  {
    if ($event['_type'] == 'task') {
      if (!class_exists('tasklist_driver')) {
        require_once (dirname(__FILE__).'/../../../tasklist/drivers/tasklist_driver.php');
      }
      if (!class_exists('tasklist_database_driver')) {
        require_once (dirname(__FILE__).'/../../../tasklist/drivers/database/tasklist_database_driver.php');
      }
      $tasks = new tasklist_database_driver($this->cal);
      $event['list'] = $event['calendar'];
      return $tasks->create_task($event);
    }
    
    if (!$this->validate($event))
      return false;

    if (!empty($this->calendars)) {
      if ($event['calendar'] && !$this->calendars[$event['calendar']]) {
        return false;
      }
      if (!$event['calendar']) {
        $event['calendar'] = reset(array_keys($this->calendars));
      }
      $event['sequence'] = 0;
      
      $event = $this->_save_preprocess($event);

      $this->rc->db->query(sprintf(
        "INSERT INTO " . $this->db_events . "
         (calendar_id, created, changed, uid, %s, %s, all_day, recurrence, title, description, location, categories, url, free_busy, priority, sensitivity, attendees, alarms, notifyat)
         VALUES (?, %s, %s, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          $this->rc->db->quote_identifier('start'),
          $this->rc->db->quote_identifier('end'),
          $this->rc->db->now(),
          $this->rc->db->now()
        ),
        $event['calendar'],
        strval($event['uid']),
        $event['start']->format(self::DB_DATE_FORMAT),
        $event['end']->format(self::DB_DATE_FORMAT),
        intval($event['all_day']),
        $event['_recurrence'],
        strval($event['title']),
        strval($event['description']),
        strval($event['location']),
        join(',', (array)$event['categories']),
        strval($event['url']),
        intval($event['free_busy']),
        intval($event['priority']),
        intval($event['sensitivity']),
        $event['attendees'],
        $event['alarms'],
        $event['notifyat']
      );

      $event_id = $this->rc->db->insert_id($this->db_events);

      if ($event_id) {
        $event['id'] = $event_id;

        // add attachments
        if (!empty($event['attachments'])) {
          foreach ($event['attachments'] as $attachment) {
            $this->add_attachment($attachment, $event_id);
            unset($attachment);
          }
        }

        $this->_update_recurrences($event);
      }

      return $event_id;
    }
    
    return false;
  }

  /**
   * Update an event entry with the given data
   *
   * @param array Hash array with event properties
   * @see calendar_driver::edit_event()
   */
  public function edit_event($event)
  {
    $event = $this->_get_id($event);

    if (!empty($this->calendars)) {
      $old = $this->get_master($event);

      $event = $this->_increase_sequence($event, $old);

      // modify a recurring event, check submitted savemode to do the right things
      if ($event['_savemode'] && ($old['recurrence'] || $old['recurrence_id'])) {
        
        // keep saved exceptions (not submitted by the client)
        if ($old['recurrence']['EXDATE'])
          $event['recurrence']['EXDATE'] = $old['recurrence']['EXDATE'];

        switch ($event['_savemode']) {
          case 'new':
            $event['uid'] = $this->cal->generate_uid();
            return $this->new_event($event);
          
          case 'current':
            $event['recurrence_date'] = new DateTime(date('Y-m-d', $event['start']->format('U')) . ' ' . date('H:i:s', $old['start']->format('U')), $this->cal->timezone);
            $event['uid'] = $old['uid'];
            $event['recurrence_id'] = $old['id'];
            $old = $this->get_master($event);
            unset($event['recurrence']);
            $old['recurrence']['EXCEPTIONS'][$event['recurrence_date']->format('Y-m-d H:i:s')] = $event;
            $event = $old;
            $success = $this->_update_recurrences($event, true);
            break;
          
          case 'future':
            $until = clone $event['end'];
            $until = $until->modify('-1 day');
            $old['recurrence']['UNTIL'] = $until;
            if ($success = $this->_update_event($old, false)) {
              $event['uid'] = $this->cal->generate_uid();
              if ($success = $this->new_event($event)) {
                $this->_clear_recurrences($event['id'], $event['start']->format(self::DB_DATE_FORMAT));
              }
            }
            break;
          
          case 'all':
            $unix_start = $event['start']->format('U');
            $unix_start_old = $old['start']->format('U');
            $diff = $unix_start - $unix_start_old;
            $tz_start = $event['start']->getTimezone();
            $tz_start = $tz_start->getName();
            $tz_start_old = $old['start']->getTimezone();
            $tz_start_old = $tz_start_old->getName();
            $tz_start = new DateTimeZone($tz_start);
            $tz_start_old = new DateTimeZone($tz_start_old);
            $transition = $tz_start->getTransitions($unix_start);
            $transition_old = $tz_start_old->getTransitions($unix_start_old);
            if ($transition[0]['isdst'] != $transition_old[0]['isdst']) {
              if ($transition[0]['isdst']) {
                $diff = $diff + 3600;
              }
              else {
                $diff = $diff - 3600;
              }
            }
            $this->_shift_recurrences($event['id'], $diff);
          default:
            $success = $this->_update_event($event, false);
            break;
        }
      }
      else {
        $success = $this->_update_event($event);
      }

      return $success;

    }
    
    return false;
  }
  
  /**
   * Get real database identifier
   */
  private function _get_id($event)
  {
    if (isset($event['id'])) {
      if ($id = $event['id']) {
        $id = current(explode('-', $id));
        if (is_numeric($id)) {
          $event['id'] = $id;
        }
      }
    }
    
    return $event;
  }

  /**
   * Convert save data to be used in SQL statements
   */
  private function _save_preprocess($event)
  {
    // shift dates to server's timezone
    $event['start'] = clone $event['start'];
    $event['start']->setTimezone($this->server_timezone);
    $event['end'] = clone $event['end'];
    $event['end']->setTimezone($this->server_timezone);
    
    // compose vcalendar-style recurrencue rule from structured data
    $rrule = $event['recurrence'] ? libcalendaring::to_rrule($event['recurrence']) : '';
    $event['_recurrence'] = rtrim($rrule, ';');
    $event['free_busy'] = intval($this->free_busy_map[strtolower($event['free_busy'])]);
    $event['sensitivity'] = intval($this->sensitivity_map[strtolower($event['sensitivity'])]);
    
    if (isset($event['allday'])) {
      $event['all_day'] = $event['allday'] ? 1 : 0;
    }
    
    // compute absolute time to notify the user
    $event['notifyat'] = $this->_get_notification($event);
    
    // process event attendees
    $_attendees = '';
    foreach ((array)$event['attendees'] as $attendee) {
      if (is_array($attendee)) {
        if (!$attendee['name'] && !$attendee['email'])
          continue;
        $_attendees .= 'NAME="'.addcslashes($attendee['name'], '"') . '"' .
          ';STATUS=' . $attendee['status'].
          ';ROLE=' . $attendee['role'] .
          ';EMAIL=' . $attendee['email'] .
          "\n";
      }
    }
    $event['attendees'] = rtrim($_attendees);

    return $event;
  }
  
  /**
   * Compute absolute time to notify the user
   */
  private function _get_notification($event)
  {
    if ($event['alarms']) {
      if ($event['recurrence']) {
        $recurrence = $this->_get_recurrence_engine($event);
        while ($next_start = $recurrence->next_start()) {
          $next_start->setTimezone($this->cal->timezone);
          if ($next_start > new DateTime()) {
            $event['start'] = $next_start;
            $alarm = libcalendaring::get_next_alarm($event);
            break;
          }
        }
      }
      else if($event['start'] > new DateTime()) {
        $alarm = libcalendaring::get_next_alarm($event);
      }
      if ($alarm['time']) {
        return date('Y-m-d H:i:s', $alarm['time']);
      }
    }

    return null;
  }

  /**
   * Save the given event record to database
   *
   * @param array Event data, already passed through self::_save_preprocess()
   * @param boolean Update recurrence exceptions
   */
  private function _update_event($event, $update_recurrences = true)
  {
    $event = $this->_save_preprocess($event);
    $sql_set = array();
    $set_cols = array('start', 'end', 'all_day', 'recurrence_id', 'sequence', 'title', 'description', 'location', 'categories', 'url', 'free_busy', 'priority', 'sensitivity', 'attendees', 'alarms', 'notifyat');
    foreach ($set_cols as $col) {
      if (is_object($event[$col]) && is_a($event[$col], 'DateTime'))
        $sql_set[] = $this->rc->db->quote_identifier($col) . '=' . $this->rc->db->quote($event[$col]->format(self::DB_DATE_FORMAT));
      else if (is_array($event[$col]))
        $sql_set[] = $this->rc->db->quote_identifier($col) . '=' . $this->rc->db->quote(join(',', $event[$col]));
      else if (isset($event[$col]))
        $sql_set[] = $this->rc->db->quote_identifier($col) . '=' . $this->rc->db->quote($event[$col]);
    }
    
    if ($event['_recurrence'])
      $sql_set[] = $this->rc->db->quote_identifier('recurrence') . '=' . $this->rc->db->quote($event['_recurrence']);
    
    if ($event['_fromcalendar'] && $event['_fromcalendar'] != $event['calendar'])
        $sql_set[] = 'calendar_id=' . $this->rc->db->quote($event['calendar']);
    
    $changed = date(self::DB_DATE_FORMAT);
    $query = $this->rc->db->query(sprintf(
      "UPDATE " . $this->db_events . "
       SET   changed=%s %s
       WHERE event_id=?
       AND   calendar_id IN (" . $this->calendar_ids . ")",
        $this->rc->db->quote($changed),
        ($sql_set ? ', ' . join(', ', $sql_set) : '')
      ),
      $event['id']
    );
    $success = $this->rc->db->affected_rows($query);

    // add attachments
    if ($success && !empty($event['attachments'])) {
      foreach ($event['attachments'] as $attachment) {
        $this->add_attachment($attachment, $event['id']);
        unset($attachment);
      }
    }

    // remove attachments
    if ($success && !empty($event['deleted_attachments'])) {
      foreach ($event['deleted_attachments'] as $attachment) {
        $this->remove_attachment($attachment, $event['id']);
      }
    }

    if ($success) {
      unset($this->cache[$event['id']]);
    }

    if ($update_recurrences) {
      $this->_update_recurrences($event);
    }
    else{
      $this->rc->db->query(
        "UPDATE " . $this->db_events . "
          SET changed = ? WHERE recurrence_id = ?",
          $changed,
          $event['id']
      );
    }

    return $success;
  }
  
  /**
   * Increase SEQUENCE (RFC5545 3.8.7.4)
   */
  private function _increase_sequence($event, $old)
  {
    $is_organizer = false;
    if (is_array($event['attendees'])) {
      foreach ($event['attendees'] as $attendee) {
        if (is_array($attendee) && $attendee['role'] == 'ORGANIZER' && (isset($attendee['email']) || isset($attendee['emails']))) {

          if (isset($attendee['emails'])) {
            $haystack = $attendee['emails'];
          }
          else {
            $haystack = $attendee['email'];
          }

          $emails[] = $this->rc->user->get_username();
          foreach ($this->rc->user->list_identities() as $identity) {
            $emails[] = strtolower($identity['email']);
          }
          $emails = array_unique($emails);

          foreach ($emails as $email) {
            if (stripos($haystack, $email) !== false) {
              $is_organizer = true;
            }
          }
        }
      }
    }
    if ($is_organizer) {
      if (isset($old['current'])) {
        $sequence = max($old['current']['sequence'] ? ($old['current']['sequence'] + 1) : 0, 1);
      }
      else {
        $sequence = max($old['sequence'] ? ($old['sequence'] + 1) : 0, 1);
      }
      $event['sequence'] = $sequence;
    }

    return $event;
  }

  /**
   * Insert RECURRENCE-ID and EXDATE entries of an event
   */
  private function _update_recurrences($event, $update_changed = false)
  {
    if (empty($this->calendars))
      return;
    
    // mark existing recurrence exceptions for deletion
    $this->rc->db->query(
      "UPDATE " . $this->db_events . "
       SET del = ? WHERE recurrence_id = ?
       AND calendar_id IN (" . $this->calendar_ids . ")",
       1,
       $event['id']
    );
    
    if ($event['recurrence']) {
      // create exception (RECURRENCE-ID)
      $changed = date(self::DB_DATE_FORMAT);
      if (is_array($event['recurrence']['EXCEPTIONS'])) {
        foreach ($event['recurrence']['EXCEPTIONS'] as $exception) {
          $exception = $this->_save_preprocess($exception);
          $exception['recurrence_date'] = new DateTime(date('Y-m-d H:i:s', $exception['recurrence_date']->format('U')), $this->cal->timezone);
          $result = $this->rc->db->query(
            "SELECT event_id FROM " . $this->db_events . "
             WHERE recurrence_id = ? AND exception = ? AND calendar_id=?",
             $event['id'],
             $exception['recurrence_date']->format(self::DB_DATE_FORMAT),
             $event['calendar']
          );
          $exists = $this->rc->db->fetch_assoc($result);
          if (is_array($exists)) {
            $this->rc->db->query(sprintf(
              "UPDATE " . $this->db_events . "
               SET recurrence_id = ?, exception = ?, changed = %s, uid = ?, %s = ?, %s = ?, all_day = ?, title = ?, description = ?, location = ?, categories = ?, url = ?, free_busy = ?, priority = ?, sensitivity = ?, attendees = ?, alarms = ?, notifyat = ?, del = ?
               WHERE event_id = ? and calendar_id = ?",
                $this->rc->db->quote($changed),
                $this->rc->db->quote_identifier('start'),
                $this->rc->db->quote_identifier('end')
              ),
              $event['id'],
              $exception['recurrence_date']->format(self::DB_DATE_FORMAT),
              strval($event['uid']),
              $exception['start']->format(self::DB_DATE_FORMAT),
              $exception['end']->format(self::DB_DATE_FORMAT),
              intval($exception['all_day']),
              strval($exception['title']),
              strval($exception['description']),
              strval($exception['location']),
              join(',', (array)$exception['categories']),
              strval($exception['url']),
              intval($exception['free_busy']),
              intval($exception['priority']),
              intval($exception['sensitivity']),
              $exception['attendees'],
              $exception['alarms'],
              $exception['notifyat'],
              0,
              $exists['event_id'],
              $event['calendar']
            );
          }
          else {
            $result = $this->rc->db->query(sprintf(
              "INSERT INTO " . $this->db_events . "
               (calendar_id, recurrence_id, exception, created, changed, uid, %s, %s, all_day, title, description, location, categories, url, free_busy, priority, sensitivity, attendees, alarms, notifyat, del)
               VALUES (?, ?, ?, %s, %s, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                $this->rc->db->quote_identifier('start'),
                $this->rc->db->quote_identifier('end'),
                $this->rc->db->quote($changed),
                $this->rc->db->quote($changed)
              ),
              $event['calendar'],
              $event['id'],
              $exception['recurrence_date']->format(self::DB_DATE_FORMAT),
              strval($event['uid']),
              $exception['start']->format(self::DB_DATE_FORMAT),
              $exception['end']->format(self::DB_DATE_FORMAT),
              intval($exception['all_day']),
              strval($exception['title']),
              strval($exception['description']),
              strval($exception['location']),
              join(',', (array)$exception['categories']),
              strval($exception['url']),
              intval($exception['free_busy']),
              intval($exception['priority']),
              intval($exception['sensitivity']),
              $exception['attendees'],
              $exception['alarms'],
              $exception['notifyat'],
              0
            );
            if (is_array($event['current']['attachments'])) {
              $event_id = $this->rc->db->insert_id($this->db_events);
              $deleted = '';
              if (is_array($exception['deleted_attachments'])) {
                foreach ($exception['deleted_attachments'] as $attachment) {
                  $deleted .= ' AND attachment_id <> ' . $this->rc->db->quote($attachment);
                }
              }
              foreach ($event['current']['attachments'] as $attachment) {
                $this->rc->db->query(
                  "INSERT INTO " . $this->db_attachments . "
                  (event_id, filename, mimetype, size, data)
                  SELECT ?, filename, mimetype, size, data
                  FROM " . $this->db_attachments . "
                  WHERE event_id = ?" . $deleted,
                  $event_id,
                  $event['id']
                );
              }
            }
          }
          if (is_array($exception['attachments'])) {
            foreach ($exception['attachments'] as $attachment) {
              if ($attachment['path']) {
                if ($data = @file_get_contents($attachment['path'])) {
                  $event_id = $exists['event_id'] ? $exists['event_id'] : $event_id;
                  $this->rc->db->query(
                    "INSERT INTO " . $this->db_attachments . "
                    (event_id, filename, mimetype, size, data)
                    VALUES (?, ?, ?, ?, ?)",
                    $event_id,
                    $attachment['name'],
                    $attachment['mimetype'],
                    $attachment['size'],
                    $data
                  );
                }
                @unlink($attachment['path']);
              }
            }
          }
        }
      }
      if (is_array($event['recurrence']['EXDATE'])) {
        foreach ($event['recurrence']['EXDATE'] as $exdate) {
          $exdate = $exdate->format('U');
          $exdate = new DateTime(date('Y-m-d H:i:s', $exdate), $this->cal->timezone);
          $result = $this->rc->db->query(
            "SELECT event_id FROM " . $this->db_events . "
             WHERE recurrence_id = ? AND exdate = ? AND calendar_id = ?",
             $event['id'],
             $exdate->format(self::DB_DATE_FORMAT),
             $event['calendar']
          );
          $exists = $this->rc->db->fetch_assoc($result);
          if (is_array($exists)) {
            $this->rc->db->query(
              "UPDATE " . $this->db_events . "
               SET exdate = ?, changed = ?, del = ?
               WHERE event_id = ? AND calendar_id = ?",
              $exdate->format(self::DB_DATE_FORMAT),
              $changed,
              0,
              $exists['event_id'],
              $event['calendar']
            );
          }
          else {
            $this->rc->db->query(sprintf(
              "INSERT INTO " . $this->db_events . "
               (calendar_id, recurrence_id, exdate, created, changed, uid, %s, %s, all_day, title, description, location, categories, url, free_busy, priority, sensitivity, attendees, alarms, notifyat, del)
               VALUES (?, ?, ?, %s, %s, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                $this->rc->db->quote_identifier('start'),
                $this->rc->db->quote_identifier('end'),
                $this->rc->db->quote($changed),
                $this->rc->db->quote($changed)
              ),
              $event['calendar'],
              $event['id'],
              $exdate->format(self::DB_DATE_FORMAT),
              strval($event['uid']),
              $event['start']->format(self::DB_DATE_FORMAT),
              $event['end']->format(self::DB_DATE_FORMAT),
              0,
              '',
              '',
              '',
              '',
              '',
              0,
              0,
              0,
              null,
              null,
              null,
              0
            );
          }
        }
      }
      


      if ($update_changed) {
        $this->rc->db->query(
          "UPDATE " . $this->db_events . "
            SET changed = ? WHERE event_id = ?",
            $changed,
            $event['id']
        );
      }
      
      unset($this->cache[$event['id']]);
      
    }
    
    // clear remaining exceptions
    $this->rc->db->query(
      "DELETE FROM " . $this->db_events . "
       WHERE del=?
       AND calendar_id IN (" . $this->calendar_ids . ")",
       1
    );

    return true;
    
  }
  
  /**
   * Remove future exceptions
   *
   * @param integer recurrence database identifier
   * @param string date (self::DB_DATE_FORMAT)
   */
  private function _clear_recurrences($recurrence_id, $date = null)
  {
    $this->rc->db->query(
      "DELETE FROM " . $this->db_events . "
        WHERE recurrence_id = ? AND (exception >= ? OR exdate >= ?)",
        $recurrence_id,
        $date,
        $date
    );
  }
  
  /**
   * Shift exceptions
   *
   * @param integer event database identifier
   * @param integer time difference in seconds
   */
  private function _shift_recurrences($recurrence_id, $diff)
  {
    $result = $this->rc->db->query(
      "SELECT event_id, exception, exdate FROM " . $this->db_events . "
        WHERE recurrence_id = ?",
        $recurrence_id
    );
    
    $changed = date(self::DB_DATE_FORMAT);
    while ($result && $record = $this->rc->db->fetch_assoc($result)) {
      if ($record['exception']) {
        $new_date = date(self::DB_DATE_FORMAT, strtotime($record['exception']) + $diff);
        $col  = 'exception';
        $col2 = 'exdate';
      }
      else if ($record['exdate']) {
        $new_date = date(self::DB_DATE_FORMAT, strtotime($record['exdate']) + $diff);
        $col  = 'exdate';
        $col2 = 'exception';
      }
      $result2 = $this->rc->db->query(
        "UPDATE " . $this->db_events . "
          SET $col = ?, changed = ? WHERE event_id = ? AND recurrence_id = ? AND $col2 IS NULL",
          $new_date,
          $changed,
          $record['event_id'],
          $recurrence_id
      );
    }
  }

  /**
   * Move a single event
   *
   * @param array Hash array with event properties
   * @see calendar_driver::move_event()
   */
  public function move_event($event)
  {
    $event = $this->_get_id($event);
    
    // let edit_event() do all the magic
    return $this->edit_event($event + (array)$this->get_master($event));
  }

  /**
   * Resize a single event
   *
   * @param array Hash array with event properties
   * @see calendar_driver::resize_event()
   */
  public function resize_event($event)
  {
    $event = $this->_get_id($event);
    
    // let edit_event() do all the magic
    return $this->edit_event($event + (array)$this->get_master($event));
  }

  /**
   * Remove a single event from the database
   *
   * @param array   Hash array with event properties
   * @param boolean Remove record irreversible (@TODO)
   *
   * @see calendar_driver::remove_event()
   */
  public function remove_event($event, $force = true)
  {
    if (!empty($this->calendars)) {
      
      $event = $this->_get_id($event);
      if ($event['_savemode']) {
        $old = $this->get_master($event);
        $savemode = $event['_savemode'];
        switch ($savemode) {
          case 'current':
            // add exception to master event
            $old['recurrence']['EXDATE'][] = new DateTime(date(self::DB_DATE_FORMAT, strtotime($event['start'])), $this->cal->timezone);
            $success = $this->_update_recurrences($old, true);
            break;

          case 'future':
            $until = new DateTime(date(self::DB_DATE_FORMAT, strtotime($event['end'])), $this->cal->timezone);
            $until = $until->modify('-1 day');
            $old['recurrence']['UNTIL'] = $until;
            $success = $this->_update_event($old, false);
            break;

          default:  // 'all' is default
            $success = $this->_remove_event($event, $force);
            break;
        }
      }
      else {
        $success = $this->_remove_event($event, $force);
      }

      return $success;
    }
    
    return false;
  }
  
  /**
   * Remove event from database or mark as deleted
   *
   * @param array Hash array with event properties
   * @param boolean force deletion (true) or mark as deleted (false)
   * @return boolean success (true) or failure (false)
   */  
  private function _remove_event($event, $force)
  {
    if ($force) {
      $result = $this->rc->db->query(
        "DELETE FROM " . $this->db_events . "
          WHERE (event_id = ? OR recurrence_id = ?)
          AND calendar_id IN (" . $this->calendar_ids . ")",
        $event['id'],
        $event['id']
      );
    }
    else {
      $result = $this->rc->db->query(sprintf(
        "UPDATE " . $this->db_events . "
          SET del = ?, changed = %s
          WHERE (event_id = ? OR recurrence_id = ?)
          AND calendar_id IN (" . $this->calendar_ids . ")",
        $this->rc->db->now()),
        1,
        $event['id'],
        $event['id']
      );
    }
    
    return $this->rc->db->affected_rows($result) ? true : false;
  }

  /**
   * Return data of a specific event
   * @param mixed  Hash array with event properties or event UID
   * @param boolean Only search in writeable calendars (ignored)
   * @param boolean Only search in active calendars
   * @param boolean Only search in personal calendars (ignored)
   * @return array Hash array with event properties
   */   
  public function get_event($event, $writeable = false, $active = false, $personal = false)
  {
    $event = $this->_get_id($event);
    $event = $this->get_master($event);
    if ($event['start'] && is_a($event['start'], 'DateTime')) {
      $event['id'] = $event['id'] . '-' . md5($event['start']->format('U'));
    }
    return $event['current'] ? $event['current'] : $event;
  }
  
  /**
   * Return data of current event
   * @param array Hash array with event properties
   */
  public function get_master($event)
  {
    $id = is_array($event) ? ($event['id'] ? $event['id'] : $event['uid']) : $event;
    $col = is_array($event) && is_numeric($id) ? 'event_id' : 'uid';

    if ($this->cache[$id])
      return $this->cache[$id];

    if ($active) {
      $calendars = $this->calendars;
      foreach ($calendars as $idx => $cal) {
        if (!$cal['active']) {
          unset($calendars[$idx]);
        }
      }
      $cals = join(',', $calendars);
    }
    else {
      $cals = $this->calendar_ids;
    }

    $result = $this->rc->db->query(sprintf(
      "SELECT e.*, (SELECT COUNT(attachment_id) FROM " . $this->db_attachments . " 
         WHERE event_id = e.event_id OR event_id = e.recurrence_id) AS _attachments
       FROM " . $this->db_events . " AS e
       WHERE e.calendar_id IN (%s)
       AND e.$col=?",
       $cals
      ),
      $id);

    if ($result && ($event = $this->rc->db->fetch_assoc($result)) && $event['event_id']) {
      $event = $this->_read_postprocess($event);
      if ($event['recurrence_id'] || $event['recurrence']) {
        $exceptions = $this->_get_master($event['recurrence_id'] ? $event['recurrence_id'] : $event['id'], $cals);
        if (is_array($exceptions)) {
          $curr_event = $event;
          $event = $exceptions['parent'];
          if (is_array($exceptions['exceptions'])) {
            $event['recurrence']['EXCEPTIONS'] = $exceptions['exceptions'];
          }
          if (is_array($exceptions['exdates'])) {
            $event['recurrence']['EXDATE'] = $exceptions['exdates'];
          }
          $event['current'] = $curr_event;
        }
      }
      unset($event['exception'], $event['exdate']);
      $this->cache[$id] = $event;

      return $this->cache[$id];
    }

    return false;
  }
  
  /**
   * Return recurrence engine
   * @param array Hash array with event properties
   * @return object Class recurrence engine
   */
  private function _get_recurrence_engine($event)
  {
    // include library class
    require_once(INSTALL_PATH . 'plugins/calendar/lib/calendar_recurrence.php');
   
    // set user's timezone
    try {
      $this->cal->timezone = new DateTimeZone($this->rc->config->get('timezone', 'GMT'));
    }
    catch (Exception $e) {
      $this->cal->timezone = new DateTimeZone($_SESSION['timezone'] ? $_SESSION['timezone'] : 'GMT');
    }
    
    return new calendar_recurrence($this->cal, $event);
  }
  
  /**
   * Return execptions and exdate data of a recurring event
   * @param int event database identifier
   * @param string calendar ids (separated by comma)
   * @return array indexed array (parent = parent event, exceptions = all exception (RECURRENCE-ID), exdates = EXDATES)
   */
  private function _get_master($event_id, $cals)
  {
    $result = $this->rc->db->query(sprintf(
      "SELECT * FROM " . $this->db_events . "
         WHERE (event_id = ? OR recurrence_id = ?) AND calendar_id IN (%s)",
         $cals
      ),
      $event_id,
      $event_id);
      
    $events = array();
    while ($result && $event = $this->rc->db->fetch_assoc($result)) {
       if (!$event['recurrence_id']) {
         $events['parent'] = $this->_read_postprocess($event);
       }
       else if ($event['exception']) {
         $events['exceptions'][$event['exception']] = $this->_read_postprocess($event);
       }
       else if ($event['exdate']) {
         $events['exdates'][$event['exdate']] = new DateTime($event['exdate']);
       }
    }
    return $events;
  }

  /**
   * Get event data
   *
   * @see calendar_driver::load_events()
   */
  public function load_events($start, $end, $query = null, $calendars = null, $virtual = 1, $modifiedsince = null, $force = false)
  {
    if ($force) 
      return true;
      
    if (empty($calendars))
      $calendars = array_keys($this->calendars);
    else if (is_string($calendars))
      $calendars = explode(',', $calendars);
      
    // only allow to select from calendars of this use
    $calendar_ids = array_map(array($this->rc->db, 'quote'), array_intersect($calendars, array_keys($this->calendars)));
    
    // compose (slow) SQL query for searching
    // FIXME: improve searching using a dedicated col and normalized values
    if ($query) {
      foreach (array('title','location','description','categories','attendees') as $col)
        $sql_query[] = $this->rc->db->ilike($col, '%'.$query.'%');
      $sql_add = 'AND (' . join(' OR ', $sql_query) . ')';
    }
    
    if (!$virtual)
      $sql_arr .= ' AND e.recurrence_id = 0';
    
    if ($modifiedsince)
      $sql_add .= ' AND e.changed >= ' . $this->rc->db->quote(date('Y-m-d H:i:s', $modifiedsince));
    
    $events = array();
    if (!empty($calendar_ids)) {
      $result = $this->rc->db->query(sprintf(
        "SELECT e.*, (SELECT COUNT(attachment_id) FROM " . $this->db_attachments . " 
           WHERE event_id = e.event_id) AS _attachments
         FROM " . $this->db_events . " AS e
         WHERE e.calendar_id IN (%s)
         AND ((e.start >= %s AND e.end <= %s) OR recurrence <> ? OR exdate IS NOT NULL) AND del <> ?
         %s
         GROUP BY e.event_id
         ORDER BY uid, exception, exdate ASC",
         join(',', $calendar_ids),
         $this->rc->db->fromunixtime($start),
         $this->rc->db->fromunixtime($end),
         $sql_add
       ), '', 1);

      while ($result && ($event = $this->rc->db->fetch_assoc($result))) {
        $event = $this->_read_postprocess($event);
        if ($virtual && $event['recurrence']) {
          $recurrences = $this->_get_recurrences($event, $end, $modifiedsince);
          if (is_array ($recurrences)) {
            foreach ($recurrences as $recurrence) {
              $recurrence['id'] = $recurrence['id'] . '-' . md5($recurrence['start']->format('U'));
              $events[] = $recurrence;
            }
          }
        }
        else {
          if ($event['exception']) {
            $parent = $this->get_master($event);
            $event['parent'] = $parent['id'] . '-' . md5(strtotime($event['exception']));
          }
          else if ($event['exdate']) {
            if ($parent = $this->get_master($event)) {
              if ($parent['id']) {
                $exdate = array();
                $duration = $parent['start'] ? $parent['start'] : $parent['current']['start'];
                $duration = $duration->diff($parent['end'] ? $parent['end'] : $parent['current']['end']);
                $exdate['start'] = new DateTime($event['exdate'], $this->cal->timezone);
                $exdate['end'] = clone $exdate['start'];
                $exdate['end']->add($duration);
                $exdate['parent'] = $parent['id'] . '-' . md5(strtotime($event['exdate']));
                $exdate['exdate'] = $event['exdate'];
                $exdate['id'] = $event['id'];
                $exdate['editable'] = false;
                $exdate['temp'] = true;
                $exdate = $exdate + $parent;
                unset($exdate['recurrence']);
                $event = $exdate;
              }
            }
          }
          else {
            $event['id'] = $event['id'] . '-' . md5($event['start']->format('U'));
          }
          $events[] = $event;
        }
      }
    }

    // ToDo: This should be a separate method triggered by core
    if ($this->rc->action == 'export_events') {
      if (class_exists('tasklist_database_driver')) {
        $dbtasks = new tasklist_database_driver($this->cal);
        $cals = array();
        foreach ($calendar_ids as $cal) {
          $cals[] = (int) str_replace("'", '', $cal);
        }
        $tasks = (array) $dbtasks->list_tasks($query, $cals, $virtual);
        foreach ($tasks as $task) {
          $task['_type'] = 'task';
          if ($task['date']) {
            $due = $task['date'] . ' ' . ($task['time'] ? ($task['time'] . ':00') : '00:00:00');
            if (strtotime($due)) {
              $task['due'] = new DateTime($due);
              unset($task['date']);
              unset($task['time']);
            }
          }
          if ($task['startdate']) {
            $start = $task['startdate'] . ' ' . ($task['starttime'] ? ($task['starttime'] . ':00') : '00:00:00');
            if  (strtotime($start)) {
              $task['start'] = new DateTime($start);
              unset($task['startdate']);
              unset($task['starttime']);
            }
          }
          $events[] = $task;
        }
      }
      
      $export = array();
      foreach ($events as $event) {
        if (isset($export[$event['uid']])) {
          if ($event['exception']) {
            $export[$event['uid']]['recurrence']['EXCEPTIONS'][] = $event;
          }
          else if ($event['exdate']) {
            $export[$event['uid']]['recurrence']['EXDATE'][] = new DateTime($event['exdate'], $this->cal->timezone);
          }
        }
        else {
          $export[$event['uid']] = $event;
        }
      }
      $events = $export;
    }

    return $events;
  }
  
  /**
   * Calculate recurrences and return clones
   */
  private function _get_recurrences($event, $end, $modifiedsince)
  {
    $recurrences = array();
    
    // Check RECURRENCE-ID (internal exception)
    $result = $this->rc->db->limitquery(
      'SELECT event_id FROM ' . $this->db_events . ' WHERE exception=? AND calendar_id=? AND recurrence_id=?',
      0,
      1,
      $event['start']->format(self::DB_DATE_FORMAT),
      $event['calendar'],
      $event['id']
    );
    if (!$exception = $this->rc->db->fetch_assoc($result)) {
      // Check for EXDATE (internal exdate)
      $result = $this->rc->db->limitquery(
        'SELECT event_id FROM ' . $this->db_events . ' WHERE exdate=? AND calendar_id=? AND recurrence_id=?',
        0,
        1,
        $event['start']->format(self::DB_DATE_FORMAT),
        $event['calendar'],
        $event['id']
      );
      if (!$exdate = $this->rc->db->fetch_assoc($result)) {
        $recurrences[] = $event;
      }
    }
    $recurrence = $this->_get_recurrence_engine($event);

    $duration = $event['start']->diff($event['end']);
    while ($next_start = $recurrence->next_start()) {
      $next_start->setTimezone($this->cal->timezone);
      $next_end = clone $next_start;
      $next_end->add($duration);
      $next = $event;
      $next['start'] = $next_start;
      $next['end'] = $next_end;
      $next['recurrence_id'] = $event['id'];
      
      // Check RECURRENCE-ID (internal exception)
      $result = $this->rc->db->limitquery(sprintf(
        'SELECT event_id FROM ' . $this->db_events . ' WHERE exception = ? AND calendar_id = ? AND recurrence_id = ?%s',
        $modifiedsince ? (' AND changed >=' . $this->rc->db->quote(date(self::DB_DATE_FORMAT, $modifiedsince))) : ''),
        0,
        1,
        $next_start->format(self::DB_DATE_FORMAT),
        $event['calendar'],
        $event['id']
      );

      if (!$exception = $this->rc->db->fetch_assoc($result)) {
        // Check for EXDATE (internal exdate)
        $result = $this->rc->db->limitquery(sprintf(
          'SELECT event_id FROM ' . $this->db_events . ' WHERE exdate = ? AND calendar_id = ? AND recurrence_id = ?%s',
          $modifiedsince ? (' AND changed >=' . $this->rc->db->quote(date(self::DB_DATE_FORMAT, $modifiedsince))) : ''),
          0,
          1,
          $next_start->format(self::DB_DATE_FORMAT),
          $event['calendar'],
          $event['id']
        );
        
        if (!$exdate = $this->rc->db->fetch_assoc($result)) {
          $next['isclone'] = 1;
          $recurrences[] = $next;
        }
      }
      
      if ($next_start->format('U') >= $end) {
        break;
      }
    }
    
    return $recurrences;
  }

  /**
   * Convert sql record into a rcube style event object
   */
  private function _read_postprocess($event)
  {
    $free_busy_map = array_flip($this->free_busy_map);
    $sensitivity_map = array_flip($this->sensitivity_map);
    
    $event['id'] = $event['event_id'];
    $event['start'] = new DateTime($event['start']);
    $event['end'] = new DateTime($event['end']);
    $event['allday'] = intval($event['all_day']);
    $event['created'] = new DateTime($event['created']);
    $event['changed'] = new DateTime($event['changed']);
    $event['free_busy'] = $free_busy_map[$event['free_busy']];
    $event['sensitivity'] = $sensitivity_map[$event['sensitivity']];
    $event['calendar'] = $event['calendar_id'];
    $event['recurrence_id'] = intval($event['recurrence_id']);
    
    // parse recurrence rule
    if ($event['recurrence'] && preg_match_all('/([A-Z]+)=([^;]+);?/', $event['recurrence'], $m, PREG_SET_ORDER)) {
      $event['recurrence'] = array();
      foreach ($m as $rr) {
        if (is_numeric($rr[2]))
          $rr[2] = intval($rr[2]);
        else if ($rr[1] == 'UNTIL')
          $rr[2] = date_create($rr[2]);
        else if ($rr[1] == 'RDATE')
          $rr[2] = array_map('date_create', explode(',', $rr[2]));
        else if ($rr[1] == 'EXDATE')
          $rr[2] = array_map('date_create', explode(',', $rr[2]));
        $event['recurrence'][$rr[1]] = $rr[2];
      }
    }
    
    if ($event['exception']) {
      $event['recurrence_date'] = new DateTime($event['exception'], $this->cal->timezone);
    }
    
    if ($event['_attachments'] > 0)
      $event['attachments'] = (array)$this->list_attachments($event);
    
    // decode serialized event attendees
    if ($event['attendees']) {
      $attendees = array();
      foreach (explode("\n", $event['attendees']) as $line) {
        $att = array();
        foreach (rcube_utils::explode_quoted_string(';', $line) as $prop) {
          list($key, $value) = explode("=", $prop);
          $att[strtolower($key)] = stripslashes(trim($value, '""'));
        }
        $attendees[] = $att;
      }
      $event['attendees'] = $attendees;
    }

    unset($event['event_id'], $event['calendar_id'], $event['notifyat'], $event['all_day'], $event['_attachments']);
    return $event;
  }

  /**
   * Get a list of pending alarms to be displayed to the user
   *
   * @see calendar_driver::pending_alarms()
   */
  public function pending_alarms($time, $calendars = null)
  {
    if (empty($calendars))
      $calendars = array_keys($this->calendars);
    else if (is_string($calendars))
      $calendars = explode(',', $calendars);
    
    // only allow to select from calendars with activated alarms
    $calendar_ids = array();
    foreach ($calendars as $cid) {
      if ($this->calendars[$cid] && $this->calendars[$cid]['showalarms'])
        $calendar_ids[] = $cid;
    }
    $calendar_ids = array_map(array($this->rc->db, 'quote'), $calendar_ids);
    
    $alarms = array();
    if (!empty($calendar_ids)) {
      $result = $this->rc->db->query(sprintf(
        "SELECT * FROM " . $this->db_events . "
         WHERE calendar_id IN (%s)
         AND notifyat <= %s AND (%s > %s OR recurrence <> ?)",
         join(',', $calendar_ids),
         $this->rc->db->fromunixtime($time),
         $this->rc->db->quote_identifier('end'),
         $this->rc->db->fromunixtime($time)
       ), '');

      while ($result && ($event = $this->rc->db->fetch_assoc($result))) {
        if (stripos($event['alarms'], ':DISPLAY') !== false)
          $alarms[] = $this->_read_postprocess($event);
      }
    }

    return $alarms;
  }

  /**
   * Feedback after showing/sending an alarm notification
   *
   * @see calendar_driver::dismiss_alarm()
   */
  public function dismiss_alarm($event_id, $snooze = 0)
  {
    $notify_at = null; //default 
    
    $event = $this->get_master(array('id' => $event_id));

    if ($snooze > 0) {
      $notify_at = date(self::DB_DATE_FORMAT, time() + $snooze);
    }
    else if ($event['recurrence'] && $event['id'] == $event_id) {
      $recurrence = $this->_get_recurrence_engine($event);
      while ($next_start = $recurrence->next_start()) {
        $next_start->setTimezone($this->cal->timezone);
        if ($next_start > new DateTime(date(self::DB_DATE_FORMAT, strtotime('+1 day')))) {
          $event['start'] = $next_start;
          $alarm = libcalendaring::get_next_alarm($event);
          if ($alarm['time']) {
            $notify_at = date(self::DB_DATE_FORMAT, $alarm['time']);
          }
          break;
        }
      }
    }
    
    $query = $this->rc->db->query(sprintf(
      "UPDATE " . $this->db_events . "
       SET   changed=%s, notifyat=?
       WHERE event_id=?
       AND calendar_id IN (" . $this->calendar_ids . ")",
        $this->rc->db->now()),
      $notify_at,
      $event_id
    );
    
    return $this->rc->db->affected_rows($query);
  }

  /**
   * Save an attachment related to the given event
   */
  private function add_attachment($attachment, $event_id)
  {
    $data = $attachment['data'] ? $attachment['data'] : file_get_contents($attachment['path']);
    
    $query = $this->rc->db->query(
      "INSERT INTO " . $this->db_attachments .
      " (event_id, filename, mimetype, size, data)" .
      " VALUES (?, ?, ?, ?, ?)",
      $event_id,
      $attachment['name'],
      $attachment['mimetype'],
      strlen($data),
      base64_encode($data)
    );

    return $this->rc->db->affected_rows($query);
  }

  /**
   * Remove a specific attachment from the given event
   */
  private function remove_attachment($attachment_id, $event_id)
  {
    $query = $this->rc->db->query(
      "DELETE FROM " . $this->db_attachments .
      " WHERE attachment_id = ?" .
        " AND event_id IN (SELECT event_id FROM " . $this->db_events .
          " WHERE event_id = ?"  .
            " AND calendar_id IN (" . $this->calendar_ids . "))",
      $attachment_id,
      $event_id
    );
    return $this->rc->db->affected_rows($query);
  }

  /**
   * List attachments of specified event
   */
  public function list_attachments($event)
  {
    $attachments = array();

    if (!empty($this->calendar_ids)) {
      $result = $this->rc->db->query(
        "SELECT attachment_id AS id, filename AS name, mimetype, size " .
        " FROM " . $this->db_attachments .
        " WHERE event_id IN (SELECT event_id FROM " . $this->db_events .
          " WHERE event_id=?"  .
            " AND calendar_id IN (" . $this->calendar_ids . "))".
        " ORDER BY filename",
        $event['event_id']
      );

      while ($result && ($arr = $this->rc->db->fetch_assoc($result))) {
        $attachments[] = $arr;
      }
    }

    return $attachments;
  }

  /**
   * Get attachment properties
   */
  public function get_attachment($id, $event)
  {
    if (!empty($this->calendar_ids)) {
      $result = $this->rc->db->query(
        "SELECT attachment_id AS id, filename AS name, mimetype, size " .
        " FROM " . $this->db_attachments .
        " WHERE attachment_id=?".
          " AND event_id=?",
        $id,
        $event['recurrence_id'] ? $event['recurrence_id'] : $event['id']
      );

      if ($result && ($arr = $this->rc->db->fetch_assoc($result))) {
        return $arr;
      }
    }

    return null;
  }

  /**
   * Get attachment body
   */
  public function get_attachment_body($id, $event)
  {
    if (!empty($this->calendar_ids)) {
      $result = $this->rc->db->query(
        "SELECT data " .
        " FROM " . $this->db_attachments .
        " WHERE attachment_id=?".
          " AND event_id=?",
        $id,
        $event['id']
      );

      if ($result && ($arr = $this->rc->db->fetch_assoc($result))) {
        return base64_decode($arr['data']);
      }
    }

    return null;
  }

  /**
   * Remove the given category
   */
  public function remove_category($name)
  {
    $query = $this->rc->db->query(
      "UPDATE " . $this->db_events . "
       SET   categories=''
       WHERE categories=?
       AND   calendar_id IN (" . $this->calendar_ids . ")",
      $name
    );
    
    return $this->rc->db->affected_rows($query);
  }

  /**
   * Update/replace a category
   */
  public function replace_category($oldname, $name, $color)
  {
    $query = $this->rc->db->query(
      "UPDATE " . $this->db_events . "
       SET   categories=?
       WHERE categories=?
       AND   calendar_id IN (" . $this->calendar_ids . ")",
      $name,
      $oldname
    );
    
    return $this->rc->db->affected_rows($query);
  }
  
  /**
   * Fetch free/busy information from a person within the given range
   *
   * @param string  E-mail address of attendee
   * @param integer Requested period start date/time as unix timestamp
   * @param integer Requested period end date/time as unix timestamp
   *
   * @return array  List of busy timeslots within the requested range
   */
  public function get_freebusy_list($email, $start, $end)
  {
    if($this->cache_slots_args == serialize(func_get_args())) {
      return $this->cache_slots;
    }
    
    $slots = array();
    
    if ($email != $this->rc->user->data['username']) {
      $sql = "SELECT user_id FROM " . $this->db_users . " WHERE username = ? AND mail_host = ?";
      $result = $this->rc->db->limitquery($sql, 0, 1, $email, $this->rc->config->get('default_host', 'localhost'));
      if ($result) {
        $user = $this->rc->db->fetch_assoc($result);
        $user_id = $user['user_id'];
      }
    }
    else {
      $user_id = $this->rc->user->ID;
    }
      
    if ($user_id) {
      $s = new DateTime(date(self::DB_DATE_FORMAT, $start), $this->server_timezone);
      $start = $s->format(self::DB_DATE_FORMAT);
      $e = new DateTime(date(self::DB_DATE_FORMAT, $end), $this->server_timezone);
      $end = $e->format(self::DB_DATE_FORMAT);
      $sql = "SELECT * FROM " . $this->db_calendars . " WHERE user_id = ? and freebusy = ?";
      $result = $this->rc->db->query($sql, $user_id, 1);
      $calendars = array();
      while ($result && $calendar = $this->rc->db->fetch_assoc($result)) {
        $calendars[] = $calendar;
      }

      foreach ($calendars as $calendar) {
        $sql = "SELECT start, end, free_busy FROM " . $this->db_events . " WHERE start <= ? AND end >= ? AND calendar_id = ? AND sensitivity = ?";
        $result = $this->rc->db->query($sql, $start, $end, $calendar['calendar_id'], 0);
        while ($result && $slot = $this->rc->db->fetch_assoc($result)) {
          $busy_start = new DateTime($slot['start'], $this->server_timezone);
          $busy_start = $busy_start->format('U');
          $busy_end = new DateTime($slot['end'], $this->server_timezone);
          $busy_end = $busy_end->format('U');
          $slots[] = array(
            $busy_start,
            $busy_end,
            $slot['free_busy'] + 1,
          );
        }
      }
    }
    
    if ($user_id && empty($slots)) {
      $slots[] = array(
        $start,
        $end,
        1,
      );
    }
      
    $this->cache_slots_args = serialize(func_get_args());

    $this->cache_slots = $slots;
      
    return $this->cache_slots;
  }
}
