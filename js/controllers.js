'use strict';

/* Controllers */
function FeedListCtrl($scope, feeds, pageSwitcher, $location) {
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

function TopLinksCtrl($scope, downloader, google) {
    $scope.downloadFiles = function() {
        downloader.downloadAll();
    };

    $scope.loadFixtures = function() {
        var newFeed = {};
        newFeed.title = "Some OGG Vorbis Podcast";
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
        newFeedItem.queued = 1;

        ixDbEz.put("feedItem", newFeedItem);
    };
}

function FeedCtrl($scope, $routeParams, $location, feeds, pageSwitcher) {
    $scope.nrQueueItemsOptions = [1, 2, 3, 4, 5];
    $scope.feed = {};
    // show info at top and items underneath
    feeds.get($routeParams.feedId)
        .then(function(feed) {
        $scope.feed = feed;
    });

    $scope.delete = function(id) {
        //TODO: check we're not playing anything from this feed?
        feeds.delete(id);

        $location.path('/feeds');
    };

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

function SettingsCtrl($scope, settings, pageSwitcher) {
    $scope.refreshIntervalOptions = [
        {name: '10 seconds', value: '10000'},
        {name: '1 hour', value: '3600000'},
        {name: '8 hour', value: '28800000'},
        {name: '1 day', value: '86400000'},
        {name: 'Manually', value: '0'}
    ];
    $scope.settings = {};

    $scope.changeInterval = function() {
        settings.set('refreshInterval', $scope.refreshInterval.value, $scope.refreshInterval.id);
    };

    $scope.changeDownloadOnWifi = function() {
        settings.set('downloadOnWifi', $scope.downloadOnWifi.value, $scope.downloadOnWifi.id);
    };

    settings.setAllValuesInScope($scope);
    pageSwitcher.change('settings');
}

function TopBarCtrl($scope, player, pageSwitcher)
{
    $scope.nowPlaying = player.nowPlaying;
    $scope.feedItem = player.feedItem;
    $scope.audio = player.audio;
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

function InfoCtrl(pageSwitcher)
{
    pageSwitcher.change('info');
}

function ImportCtrl($scope, pageSwitcher, google)
{
    $scope.importGoogle = function() {
        google.import($scope.email, $scope.password);
    };

    pageSwitcher.backPage = true;
    pageSwitcher.change('settings');
}