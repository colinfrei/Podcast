'use strict';

angular.module('podcasts.alarmManager', ['podcasts.settings', 'podcasts.downloader'])
    .run(['alarmManager', 'updateFeedsAlarmManager', function(alarmManager, updateFeedsAlarmManager) {
        updateFeedsAlarmManager.setAlarmListener();
        alarmManager.setAlarmListener();
    }])
    .service('alarmManager', ['$log', '$window', function($log, $window) {
        var alarmManager = $window.navigator.mozAlarms,
            alarmHandlers = [];

        if (!alarmManager) {
            $log.log('navigator.mozAlarms is not available');
            return {
                setAlarmIn: angular.noop,
                removeExistingAlarms: angular.noop,
                setAlarmListener: angular.noop,
                addAlarmListener: angular.noop
            };
        }

        function setAlarmIn(milliSeconds, data) {
            var now = new Date(),
                alarmDate = new Date(+now + +milliSeconds);

            //TODO: check how to set timezone-specific alarms
            var setAlarmRequest = alarmManager.add(alarmDate, "ignoreTimezone", data);
            setAlarmRequest.onsuccess = function () {
                $log.log("Alarm scheduled for " + alarmDate);
            };
            setAlarmRequest.onerror = function (e) {
                $log.log("An error occurred when scheduling the alarm: " + e.target.error.name);
            };
        }

        function removeExistingAlarms(type)
        {
            var allAlarms = alarmManager.getAll();
            allAlarms.onsuccess = function (e) {
                this.result.forEach(function (alarm) {
                    if (type === alarm.data.type) {
                        alarmManager.remove(alarm.id);
                    }
                });
            };
        }

        function addAlarmListener(type, alarmFunction)
        {
            alarmHandlers.push({type: type, handle: alarmFunction});
        }

        function handleAlarm(alarm)
        {
            alarmHandlers.forEach(function (alarmHandler) {
                if (alarm.data.type == alarmHandler.type) {
                    alarmHandler.handle(alarm);
                }
            });
        }

        function setAlarmListener()
        {
            $window.navigator.mozSetMessageHandler("alarm", handleAlarm);
        }

        return {
            setAlarmIn: setAlarmIn,
            removeExistingAlarms: removeExistingAlarms,
            addAlarmListener: addAlarmListener,
            setAlarmListener: setAlarmListener
        };
    }])
    .service('updateFeedsAlarmManager', ['settings', 'alarmManager', 'downloader', function(settings, alarmManager, downloader) {
        var alarmType = "updateFeeds";

        function setAlarm()
        {
            settings.get('refreshInterval').then(function(value) {
                if (value.value > 0) {
                    var refreshInterval = value.value;

                    alarmManager.setAlarmIn(refreshInterval, {type: alarmType});
                }
            });
        }

        function changeAlarmInterval(newInterval)
        {
            alarmManager.removeExistingAlarms(alarmType);
            setAlarm();
        }

        function setAlarmListener()
        {
            alarmManager.addAlarmListener(alarmType, function(alarm) {
                downloader.downloadAll(true);
                setAlarm();
            });
        }

        return {
            setAlarm: setAlarm,
            changeAlarmInterval: changeAlarmInterval,
            setAlarmListener: setAlarmListener
        };
    }]);
