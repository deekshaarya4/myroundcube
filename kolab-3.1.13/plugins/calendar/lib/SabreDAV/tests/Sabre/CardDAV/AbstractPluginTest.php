<?php

namespace Sabre\CardDAV;

use Sabre\DAV;
use Sabre\DAVACL;

abstract class AbstractPluginTest extends \PHPUnit_Framework_TestCase {

    /**
     * @var Sabre\CardDAV\Plugin
     */
    protected $plugin;
    /**
     * @var Sabre\DAV\Server
     */
    protected $server;
    /**
     * @var Sabre\CardDAV\Backend\Mock;
     */
    protected $backend;

    function setUp() {

        $this->backend = new Backend\Mock();
        $principalBackend = new DAVACL\PrincipalBackend\Mock();

        $tree = array(
            new AddressBookRoot($principalBackend, $this->backend),
            new DAVACL\PrincipalCollection($principalBackend)
        );

        $this->plugin = new Plugin();
        $this->plugin->directories = array('directory');
        $this->server = new DAV\Server($tree);
        $this->server->addPlugin($this->plugin);
        $this->server->debugExceptions = true;

    }

}