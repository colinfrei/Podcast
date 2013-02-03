'use strict';

/* Controllers */
function FeedListCtrl($scope, feeds, pageSwitcher, $route, $location) {
    $scope.feeds = feeds.feeds = [];
    feeds.list($scope);

    $scope.addFeed = function() {
        feeds.add($scope.newFeedUrl);
    };

    $scope.goToFeed = function(hash) {
        $location.path('/feed/'+hash);
    };

    pageSwitcher.change('feeds');
}

function TopLinksCtrl($scope, feeds, feedItems, downloader) {
    $scope.downloadFiles = function() {
        downloader.downloadAll();
    };

    $scope.loadFixtures= function() {
        var newFeed = {};
        newFeed.name = "Some OGG Vorbis Podcast";
        newFeed.url = "http://www.c3d2.de/pentacast-ogg.xml";

        //add new record to the local database
        ixDbEz.put("feed", newFeed);


        var newFeedItem = {};
        newFeedItem.guid = 'http://example.com/1';
        newFeedItem.feedId = 1;
        newFeedItem.title = 'Example Item 1';
        newFeedItem.link = 'http://example.com/1';
        newFeedItem.date = 'Date';
        newFeedItem.description = 'Long Description<br /> with HTML <b>and stuff</b>';
        newFeedItem.audioUrl = 'http://example.com/1';
        newFeedItem.queued = 1;

        ixDbEz.put("feedItem", newFeedItem);


        var newFeedItem = {};
        newFeedItem.guid = 'http://example.com/2';
        newFeedItem.feedId = 1;
        newFeedItem.title = 'Example Item 2';
        newFeedItem.link = 'http://example.com/2';
        newFeedItem.date = 'Date';
        newFeedItem.description = 'Second Long Description<br /> with HTML <b>and stuff</b>';
        newFeedItem.audioUrl = 'http://example.com/2';
        newFeedItem.queued = 0;

        ixDbEz.put("feedItem", newFeedItem);
    };
}

function FeedCtrl($scope, $routeParams, feeds, pageSwitcher) {
    $scope.feed = {};
    // show info at top and items underneath
    feeds.get($routeParams.feedId, function(feed) {
        $scope.feed = feed;
        $scope.$apply();
    });

    pageSwitcher.setBack('feeds');
}

function QueueListCtrl($scope, $rootScope, pageSwitcher, feedItems, feeds, queueList) {
    $scope.queue = [];
    queueList.init($scope);
    feedItems.listQueue(queueList);

    $scope.playItem = function(id) {
        feedItems.get(id, function(feedItem) {
            $rootScope.$broadcast('playItem', feedItem);
        });
    };

    $scope.downloadItems = function(updateStatus) {
        feeds.downloadAllItems(feedItems, function(feedItem, feed) {
            if (feedItem) {
                $scope.queue.push(feedItem);
                $scope.$apply();
            }

            updateStatus(feed);
        });
    };

    pageSwitcher.change('queue');
}

function SettingsCtrl($scope, $route, settings, pageSwitcher) {
    $scope.refreshIntervalOptions = [
        {name: '1 hour', value: '1h'},
        {name: '8 hour', value: '8h'},
        {name: '1 day', value: '1d'},
        {name: 'Manually', value: '0'}
    ];
    $scope.refreshInterval = {'value': '', 'id': ''};
    $scope.downloadOnWifi = {'value': '', 'id': ''};

    $scope.changeInterval = function() {
        settings.set('refreshInterval', $scope.refreshInterval.value, $scope.refreshInterval.id);
    };

    $scope.changeDownloadOnWifi = function() {
        settings.set('downloadOnWifi', $scope.downloadOnWifi.value, $scope.downloadOnWifi.id);
    };

    $scope.installApp = function() {
        if (navigator.mozApps) {
            var checkIfInstalled = navigator.mozApps.getSelf();
            checkIfInstalled.onsuccess = function () {
                if (checkIfInstalled.result) {
                    alert('already Installed');
                    // Already installed
                } else {
                    var manifestURL = "http://localhost/b2gPodcast/package.manifest";
                    var installApp = navigator.mozApps.install(manifestURL);

                    installApp.onsuccess = function(data) {
                        alert('weeeh - installed!');
                    };
                    installApp.onerror = function() {
                        alert("Install failed:\n\n" + installApp.error.name);
                    };
                }
            };
            checkIfInstalled.onerror = function() {
                alert('could not check if installed');
            };
        } else {
            alert("Open Web Apps are not supported");
        }
    };

    settings.setAllValuesInScope($scope);
    pageSwitcher.change('settings');
}

function TopBarCtrl($scope, player, pageSwitcher)
{
    $scope.nowPlaying = player.nowPlaying;
    $scope.showingPageSwitchMenu = false;
    $scope.showingFullCurrentInfo = false;
    $scope.showInfoIcon = false;

    $scope.playPause = function() {
        if (player.playing()) {
            player.pause();
        } else {
            player.play();
        }
    };

    $scope.$on('playItem', function(event, feedItem) {
        player.play(feedItem, $scope);
    });

    $scope.currentInfo = function() {
        $scope.showingFullCurrentInfo = !$scope.showingFullCurrentInfo;

        // TODO: decide if I need to open or close
        // Open
        // uncollapse area
        // fill area with content
          // get currently playing item
          //
    };

    $scope.showPageSwitchMenu = function() {
        $scope.showingPageSwitchMenu = true;
        $scope.$apply();
    };

    $scope.changePage = function(newPage) {
        pageSwitcher.goToPage(newPage);
        $scope.showingPageSwitchMenu = false;
    };
    $scope.showBackLink = function() {
        return !!pageSwitcher.backPage;
    };
}

function InfoCtrl($scope, pageSwitcher)
{
    pageSwitcher.change('info');
}
