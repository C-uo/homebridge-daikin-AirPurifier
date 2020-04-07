const request = require('superagent');

var Service, Characteristic;

// 注册配件
module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-daikin-AirPurifier", "DaikinAirPurifier", DaikinAirPurifier);
};

// 编写配件
function DaikinAirPurifier(log, config) {
    this.log = log;
    this.name = config.name || "ダイキン";
    this.model = config.model || "unknow";
    this.serial = config.serial || "843-R3B-9A2";
    this.host = config.host;

    this.services = []
    this.AirPurifierInfo = {pow: '0', mode: '0', airvol: '0', humd: '0'}
    this.SensorInfo = {htemp: '0.0', hhum: '0', pm25: '-0', dust: '-0', odor: '-0'}
}

DaikinAirPurifier.prototype = {
    identify: function (callback) {
        this.log('Identify requested!');
        callback() // success
    },

    getServices: function () {
        const airPurifierServiceInfo = new Service.AccessoryInformation()
        airPurifierServiceInfo
            .setCharacteristic(Characteristic.Manufacturer, this.name)   // 这三个字符串将显示在Home中
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial)

        // 空気清浄機
        const airPurifierService = new Service.AirPurifier('空気清浄機')
        airPurifierService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getActive.bind(this))
            .on('set', this.setActive.bind(this))

        airPurifierService
            .getCharacteristic(Characteristic.CurrentAirPurifierState)
            .on('get', this.getCurrentAirPurfierState.bind(this))

        airPurifierService
            .getCharacteristic(Characteristic.TargetAirPurifierState)
            .on('get', this.getTargetAirPurifierState.bind(this))
            .on('set', this.setTargetAirPurifierState.bind(this))

        airPurifierService
            .getCharacteristic(Characteristic.RotationSpeed)
            .on('get', this.getRotationSpeed.bind(this))
            .on('set', this.setRotationSpeed.bind(this))

        // 空気質センサー
        const airQualitySensor = new Service.AirQualitySensor('空気質センサー')
        airQualitySensor
            .getCharacteristic(Characteristic.StatusActive)
            .on('get', this.getStatusActive.bind(this))

        airQualitySensor
            .getCharacteristic(Characteristic.AirQuality)
            .on('get', this.getAirQuality.bind(this))

        airQualitySensor
            .getCharacteristic(Characteristic.PM2_5Density)
            .on('get', this.getPM2_5Density.bind(this))

        airQualitySensor
            .getCharacteristic(Characteristic.SulphurDioxideDensity) // 没有在HomeKit里找到对应Daikin的气味检测的选项
            .on('get', this.getOdur.bind(this))        // 所以挪用二氧化硫作为代替

        airQualitySensor
            .getCharacteristic(Characteristic.VOCDensity)           // 同样的用挥发性有机物代替灰尘数量
            .on('get', this.getDust.bind(this))


        const temperatureSensor = new Service.TemperatureSensor('温度計')
        temperatureSensor
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', this.getCurrentTemp.bind(this))

        temperatureSensor
            .getCharacteristic(Characteristic.StatusActive)
            .on('get', this.getStatusActive.bind(this))

        const humidifierDehumidifer = new Service.HumidifierDehumidifier('加湿器')
        humidifierDehumidifer
            .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .on('get', this.getCurrentHumidity.bind(this))

        humidifierDehumidifer
            .getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
            .on('get', this.getCurrentHumidifierState.bind(this))

        humidifierDehumidifer
            .getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
            .on('get', this.getTargetHumidifierState.bind(this))
            .on('set', this.setTargetHumidifierState.bind(this))

        humidifierDehumidifer
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getHumidifierActive.bind(this))
            .on('set', this.setHumidifierActive.bind(this))


        this.services.push(airPurifierService);
        this.services.push(airPurifierServiceInfo);
        this.services.push(airQualitySensor);
        this.services.push(temperatureSensor);
        this.services.push(humidifierDehumidifer);

        return this.services;
    },


    getActive: function (callback) {
        this.log('GET ACTIVE STATE');
        request
            .get(this.host + '/cleaner/get_unit_info')
            .end(function (error, response) {
                if (error && response.statusCode != 200) {
                    this.log('GET ACTIVE STATE Failed: %s' + error)
                    return callback(error)
                }
                const Info = analyzeUnitInfo(response.text)
                this.AirPurifierInfo = Info.ctrl_info
                this.SensorInfo = Info.sensor_info
                this.unitStatus = Info.unit_status

                if (this.AirPurifierInfo.pow == 1) {
                    return callback(null, Characteristic.Active.ACTIVE)
                } else if (this.AirPurifierInfo.pow == 0) {
                    return callback(null, Characteristic.Active.INACTIVE)
                }
            }.bind(this));
    },

    setActive: function (state, callback, context) {
        request
            .get(this.host + '/cleaner/set_control_info')
            .query({'pow': state})
            .end(function (error, response) {
                if (error && response.statusCode != 200) {
                    this.log('SET ACTIVE STATE Failed: %s' + error)
                    return callback(error)
                }
                this.log('SET ACTIVE STATE:' + state == 0 ? "OFF" : "ON");
                return callback(null);
            }.bind(this));
    },

    getCurrentAirPurfierState: function (callback) {
        this.log('GET CURRENT AIR PURFIER STATE')
        request
            .get(this.host + '/cleaner/get_unit_info')
            .end(function (error, response) {
                if (error && response.statusCode != 200) {
                    this.log('GET CURRENT AIR PURFIER STATE Failed: %s' + error)
                    return callback(error)
                }
                const Info = analyzeUnitInfo(response.text)
                this.AirPurifierInfo = Info.ctrl_info
                this.SensorInfo = Info.sensor_info
                this.unitStatus = Info.unit_status

                if (this.AirPurifierInfo.pow == 0) {   // 電源オフ
                    return callback(null, Characteristic.CurrentAirPurifierState.INACTIVE)
                }
                if (this.AirPurifierInfo.mode == 2) {  // 節電
                    return callback(null, Characteristic.CurrentAirPurifierState.IDLE)
                } else {
                    return callback(null, Characteristic.CurrentAirPurifierState.PURIFYING_AIR)
                }
            }.bind(this));
    },

    getTargetAirPurifierState: function (callback) {
        this.log('GET TARGET AIR PURIFIER STATE');
        request
            .get(this.host + '/cleaner/get_unit_info')
            .end(function (error, response) {
                if (error && response.statusCode != 200) {
                    this.log('GET TARGET AIR PURIFIER Failed: %s' + error)
                    return callback(error)
                }
                const Info = analyzeUnitInfo(response.text)
                this.AirPurifierInfo = Info.ctrl_info
                this.SensorInfo = Info.sensor_info
                this.unitStatus = Info.unit_status

                const {mode, airvol, humd} = this.AirPurifierInfo
                if (mode == 1 || airvol == 0 || humd == 4) {
                    this.log('Current mode is Auto(おまかせ)')
                    return callback(null, Characteristic.TargetAirPurifierState.AUTO)
                }
                return callback(null, Characteristic.TargetAirPurifierState.MANUAL)
            }.bind(this));
    },

    setTargetAirPurifierState: function (state, callback, context) {
        // state will be 0 or 1

        callback()
    },

    getRotationSpeed: function (callback) {
        this.log('GET ROTATION SPEED STATE');
        request
            .get(this.host + '/cleaner/get_unit_info')
            .end(function (error, response) {
                if (error && response.statusCode != 200) {
                    this.log('GET TARGET AIR PURIFIER Failed: %s' + error)
                    return callback(error)
                }
                const Info = analyzeUnitInfo(response.text)
                this.AirPurifierInfo = Info.ctrl_info
                this.SensorInfo = Info.sensor_info
                this.unitStatus = Info.unit_status

                switch (this.AirPurifierInfo.airvol) {
                    case '0': //
                        return callback(null, 0)
                    case '1':
                        return callback(null, 20)
                    case '2':
                        return callback(null, 40)
                    case '3':
                        return callback(null, 60)
                    case '4':
                        return callback(null, 80)
                    case '5':
                        return callback(null, 100)

                }
            }.bind(this));
    },

    setRotationSpeed: function (state, callback, context) {
        callback()
    },

    getStatusActive: function (callback) {
        this.log('GET STATUS ACTIVE')
        try {
            if (this.AirPurifierInfo.pow == 1) {
                return callback(null, true)
            }
            callback(null, false)
        } catch (e) {
            this.log('GET STATUS ACTIVE Failed:' + e)
            callback(e)
        }
    },

    getAirQuality: function (callback) {
        this.log('GET AIR QUALITY')
        try {
            const {pm25, dust, odor} = this.SensorInfo
            let airQuality = Characteristic.AirQuality.UNKNOWN

            if (pm25 >= 0 || dust >= 0 || odor >= 0) airQuality = Characteristic.AirQuality.EXCELLENT;
            if (pm25 > 1 || dust > 1 || odor > 1) airQuality = Characteristic.AirQuality.GOOD;
            if (pm25 > 2 || dust > 2 || odor > 2) airQuality = Characteristic.AirQuality.FAIR;
            if (pm25 > 3 || dust > 3 || odor > 3) airQuality = Characteristic.AirQuality.INFERIOR;
            if (pm25 > 4 || dust > 4 || odor > 4) airQuality = Characteristic.AirQuality.POOR;
            return callback(null, airQuality)
        } catch
            (e) {
            this.log('GET AIR QUALITY Failed:' + e)
            callback(e)
        }
    },

    getPM2_5Density: function (callback) {
        this.log('GET PM2.5 Density')
        try {
            return callback(null, this.SensorInfo.pm25)
        } catch (e) {
            this.log('GET PM2.5 Density Failed:' + e)
            return callback(e)
        }
    },

    getOdur: function (callback) {
        this.log('GET odur to SulphurDioxideDensity:')
        try {
            return callback(null, this.SensorInfo.odor)
        } catch (e) {
            this.log('GET odur Failed: ' + e)
            return callback(e)
        }
    },

    getDust: function (callback) {
        this.log('GET dust to VOCDensity')
        try {
            return callback(null, this.SensorInfo.dust)
        } catch (e) {
            this.log('GET dust Failed: ' + e)
            return callback(e)
        }
    },

    getCurrentTemp: function (callback) {
        this.log('GET Current Temperature')
        try {
            return callback(null, this.SensorInfo.htemp)
        } catch (e) {
            this.log('GET Temperature Failed:' + e)
            return callback(e)
        }
    },

    getCurrentHumidity: function (callback) {
        this.log('GET Current Humidit Humidity')
        try {
            return callback(null, this.SensorInfo.hhum)
        } catch (e) {
            this.log('GEt Current Humidit Humidity Failed: ' + e)
            return callback(e)
        }
    },

    getHumidifierActive: function (callback) {
        this.log('GET Humidifier ACTIVE')
        try {
            const {pow, humd, mode} = this.AirPurifierInfo
            if ((pow == 1) && (mode == 1 || humd != 0)) {
                return callback(null, Characteristic.Active.ACTIVE)
            }
            return callback(null, Characteristic.Active.INACTIVE)

        } catch (e) {
            this.log('GET Humidifier ACTIVE Failed: ' + e)
            return callback(e)
        }
    },

    setHumidifierActive: function (state, callback) {

        callback()
    },

    getCurrentHumidifierState: function (callback) {
        callback()
    },

    getTargetHumidifierState: function (callback) {
        callback()
    },

    setTargetHumidifierState: function (state, callback) {
        this.log('SET TARGET Humidifier state: ' + state)
        callback()
    },

};

function analyzeResponse(text) {
    return JSON.parse('{"' + text.replace(/(=)/g, '":"').replace(/(,)/g, '","') + '"}')
}

function analyzeUnitInfo(text) {
    /*
    text should like
    ret=OK,ctrl_info=pow%3d1%2cmode%3d1%2cairvol%3d0%2chumd%3d4,sensor_info=htemp%3d20.0%2chhum%3d37%2cpm25%3d0%2cdust%3d0%2codor%3d0,unit_status=filter%3d0%2cstrmr_cln%3d0%2cwater_supply%3d0%2cunit_err%3d0000,dev_setting=led_dsp%3d1%2cd_sns%3d0%2cc_lock%3d0%2cstreamer%3d0%2cact_ion%3d1%2cbuzzer%3d1%2cturbo%3d-%2ceco_moni%3d1

    will return
    {
  ret: 'OK',
  ctrl_info: { pow: '1', mode: '1', airvol: '0', humd: '4' },
  sensor_info: { htemp: '20.0', hhum: '37', pm25: '0', dust: '0', odor: '0' },
  unit_status: { filter: '0', strmr_cln: '0', water_supply: '0', unit_err: '0000' },
  dev_setting: {
    led_dsp: '1',
    d_sns: '0',
    c_lock: '0',
    streamer: '0',
    act_ion: '1',
    buzzer: '1',
    turbo: '-',
    eco_moni: '1'
  }
}
     */
    let obj = analyzeResponse(text)
    for (let key in obj) {
        if (key === 'ret') continue;
        obj[key] = analyzeResponse(unescape(obj[key]))
    }
    return obj
}
