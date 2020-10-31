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
    this.log = log
    this.name = config.name || "ダイキン"
    this.model = config.model || "unknow"
    this.serial = config.serial || "843-R3B-9A2"
    this.host = config.host

    this.services = []
    this.AirPurifierInfo = {pow: '0', mode: '0', airvol: '0', humd: '0'}
    this.SensorInfo = {htemp: '0.0', hhum: '0', pm25: '-0', dust: '-0', odor: '-0'}
    this.unit_status = {filter: '0', strmr_cln: '0', water_supply: '0', unit_err: '0000'}


    this.airPurifierServiceInfo = new Service.AccessoryInformation()
    this.airPurifierServiceInfo
        .setCharacteristic(Characteristic.Manufacturer, this.name)   // 这三个字符串将显示在Home中
        .setCharacteristic(Characteristic.Model, this.model)
        .setCharacteristic(Characteristic.SerialNumber, this.serial)

    // 空気清浄機
    this.airPurifierService = new Service.AirPurifier('空気清浄機')
    this.airPurifierService
        .getCharacteristic(Characteristic.Active)
        .on('get', this.getActiveStatus.bind(this))
        .on('set', this.setActiveStatus.bind(this))

    this.airPurifierService
        .getCharacteristic(Characteristic.CurrentAirPurifierState)
        .on('get', this.getCurrentAirPurfierState.bind(this))

    this.airPurifierService
        .getCharacteristic(Characteristic.TargetAirPurifierState)
        .on('get', this.getTargetAirPurifierState.bind(this))
        .on('set', this.setTargetAirPurifierState.bind(this))

    this.airPurifierService
        .getCharacteristic(Characteristic.RotationSpeed)
        .on('get', this.getRotationSpeed.bind(this))
        .on('set', this.setRotationSpeed.bind(this))


    // 加湿器
    this.humidifierDehumidifer = new Service.HumidifierDehumidifier('加湿器')
    this.humidifierDehumidifer
        .getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', this.getCurrentHumidity.bind(this))

    this.humidifierDehumidifer
        .getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
        .on('get', this.getCurrentHumidifierState.bind(this))

    this.humidifierDehumidifer
        .getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
        .on('get', this.getTargetHumidifierState.bind(this))
        .on('set', this.setTargetHumidifierState.bind(this))

    this.humidifierDehumidifer
        .getCharacteristic(Characteristic.Active)
        .on('get', this.getHumidifierActive.bind(this))
        .on('set', this.setHumidifierActive.bind(this))


    this.humidifierDehumidifer
        .getCharacteristic(Characteristic.WaterLevel)
        .on('get', this.getWaterLevel.bind(this))


    // 空気質センサー
    this.airQualitySensor = new Service.AirQualitySensor('空気質センサー')
    this.airQualitySensor
        .getCharacteristic(Characteristic.StatusActive)
        .on('get', this.getStatusActive.bind(this))

    this.airQualitySensor
        .getCharacteristic(Characteristic.AirQuality)
        .on('get', this.getAirQuality.bind(this))

    this.airQualitySensor
        .getCharacteristic(Characteristic.PM2_5Density)
        .on('get', this.getPM2_5Density.bind(this))

    this.airQualitySensor
        .getCharacteristic(Characteristic.SulphurDioxideDensity) // 没有在HomeKit里找到对应Daikin的气味检测的选项
        .on('get', this.getOdur.bind(this))        // 所以挪用二氧化硫作为代替

    this.airQualitySensor
        .getCharacteristic(Characteristic.VOCDensity)           // 同样的用挥发性有机物代替灰尘数量
        .on('get', this.getDust.bind(this))

    // 温度計
    this.temperatureSensor = new Service.TemperatureSensor('温度計')
    this.temperatureSensor
        .getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.getCurrentTemp.bind(this))

    this.temperatureSensor
        .getCharacteristic(Characteristic.StatusActive)
        .on('get', this.getStatusActive.bind(this))


    // 湿度計
    this.humiditySensor = new Service.HumiditySensor('湿度計')
    this.humiditySensor
        .getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', this.getCurrentHumidity.bind(this))

    this.humiditySensor
        .getCharacteristic(Characteristic.StatusActive)
        .on('get', this.getStatusActive.bind(this))


    this.services.push(this.airPurifierServiceInfo);
    this.services.push(this.airPurifierService);
    this.services.push(this.airQualitySensor);
    this.services.push(this.temperatureSensor);
    this.services.push(this.humidifierDehumidifer);
    this.services.push(this.humiditySensor);

    this.discover()
}

DaikinAirPurifier.prototype = {
    identify: function (callback) {
        this.log('Identify requested!');
        return callback() // success
    },

    getServices: function () {
        return this.services;
    },

    discover: function () {
        if (this.AirPurifierInfo.pow == 0) return;
        try {
            request
                .get(this.host + '/cleaner/get_unit_info')
                .end(function (error, response) {
                    if (error || !response.text.includes('ret=OK')) {
                        throw error
                    }

                    const Info = analyzeUnitInfo(response.text)
                    this.AirPurifierInfo = Info.ctrl_info
                    this.SensorInfo = Info.sensor_info
                    this.unitStatus = Info.unit_status

                    this.updateAll()
                }.bind(this));
        } catch (e) {
            this.log('Failed to discover Daikin Air Purifier')
        }
    },

    getActiveStatus: function (callback) {
        this.log('GET ACTIVE STATE');
        try {
            request
                .get(this.host + '/cleaner/get_unit_info')
                .end(function (error, response) {
                    if (error) throw error
                    const Info = analyzeUnitInfo(response.text)
                    this.AirPurifierInfo = Info.ctrl_info
                    this.SensorInfo = Info.sensor_info
                    this.unitStatus = Info.unit_status

                    return callback(null, this.activeStatus())
                }.bind(this));
        } catch (error) {
            this.log('GET ACTIVE STATE Failed: %s' + error)
            return callback(error)
        }
    },

    activeStatus: function () {
        if (this.AirPurifierInfo.pow == 1) {
            return Characteristic.Active.ACTIVE
        } else if (this.AirPurifierInfo.pow == 0) {
            return Characteristic.Active.INACTIVE
        }
    },

    setActiveStatus: function (state, callback) {
        try {
            request
                .get(this.host + '/cleaner/set_control_info')
                .query({'pow': state})
                .end(function (error, response) {
                    if (error || !response.text.includes('ret=OK')) throw error
                    if (state == 1) this.AirPurifierInfo.pow = state
                    this.log('SET ACTIVE STATE(電源):' + (state == 0 ? "OFF" : "ON"))
                    return callback()
                }.bind(this));
        } catch (e) {
            this.log('SET ACTIVE STATE Failed: ' + e)
            return callback(e)
        }
    },

    getCurrentAirPurfierState: function (callback) {
        this.log('GET CURRENT AIR PURFIER STATE')
        try {
            request
                .get(this.host + '/cleaner/get_unit_info')
                .end(function (error, response) {
                    if (error) throw error
                    const Info = analyzeUnitInfo(response.text)
                    this.AirPurifierInfo = Info.ctrl_info
                    this.SensorInfo = Info.sensor_info
                    this.unitStatus = Info.unit_status

                    return callback(null, this.currentAirPurfierState())
                }.bind(this));
        } catch (error) {
            this.log('GET CURRENT AIR PURFIER STATE Failed: %s' + error)
            return callback(error)
        }
    },

    currentAirPurfierState: function () {
        if (this.AirPurifierInfo.pow == 0) return Characteristic.CurrentAirPurifierState.INACTIVE
        if (this.AirPurifierInfo.mode == 2) return Characteristic.CurrentAirPurifierState.IDLE
        return Characteristic.CurrentAirPurifierState.PURIFYING_AIR
    },

    getTargetAirPurifierState: function (callback) {
        this.log('GET TARGET AIR PURIFIER STATE');
        try {
            request
                .get(this.host + '/cleaner/get_unit_info')
                .end(function (error, response) {
                    if (error) throw error
                    const Info = analyzeUnitInfo(response.text)
                    this.AirPurifierInfo = Info.ctrl_info
                    this.SensorInfo = Info.sensor_info
                    this.unitStatus = Info.unit_status

                    return callback(null, this.targetAirPurifierState())
                }.bind(this));
        } catch (error) {
            this.log('GET TARGET AIR PURIFIER Failed: %s' + error)
            return callback(error)
        }
    },

    targetAirPurifierState: function () {
        const {mode, airvol, humd} = this.AirPurifierInfo
        if (mode == 1 || airvol == 0 || humd == 4) {
            this.log('Current mode is Auto(おまかせ)')
            return Characteristic.TargetAirPurifierState.AUTO
        }
        return Characteristic.TargetAirPurifierState.MANUAL
    },

    setTargetAirPurifierState: function (state, callback) {
        // state will be 0 or 1
        try {
            const {pow, mode, airvol, humd} = this.AirPurifierInfo
            request
                .get(this.host + '/cleaner/set_control_info')
                .query({
                    'pow': pow,
                    'mode': state,
                    'airvol': state == 0 ? 1 : 0,
                    'humd': state == 0 ? humd : 4
                })
                .end(function (error, response) {
                    if (error) throw error
                    this.log('SET TARGET AIR PURIFIER: ' + (state == 0 ? "マニュアル(しずか｜現在の加湿器モードを維持)" : "おまかせ"));
                    return callback(null)
                }.bind(this));
        } catch (error) {
            this.log('SET TARGET AIR PURIFIER STATE Failed: %s' + error)
            return callback(error)

        }
    },

    getRotationSpeed: function (callback) {
        this.log('GET ROTATION SPEED STATE');
        try {
            request
                .get(this.host + '/cleaner/get_unit_info')
                .end(function (error, response) {
                    if (error) throw error
                    const Info = analyzeUnitInfo(response.text)
                    this.AirPurifierInfo = Info.ctrl_info
                    this.SensorInfo = Info.sensor_info
                    this.unitStatus = Info.unit_status

                    return callback(null, this.rotationSpeed())
                }.bind(this));
        } catch (e) {
            this.log('GET  Rotation Speed Failed: %s' + e)
            return callback(e)
        }
    },

    rotationSpeed: function () {
        switch (this.AirPurifierInfo.airvol) {
            case '1':
                return 15
            case '2':
                return 35
            case '3':
                return 60
            case '5':
                return 98
            case '0':
                return 100
        }
    },

    setRotationSpeed: function (state, callback) {
        // state will be 0 ~ 100
        try {
            const {pow, mode, airvol, humd} = this.AirPurifierInfo
            let type = ''

            switch (true) {
                case state == 0:
                    this.log('風量0になるため、電源オフ')
                    break
                case state <= 20:
                    state = 1
                    type = 'しずか'
                    break
                case state <= 45:
                    state = 2
                    type = '弱め'
                    break
                case state <= 80:
                    state = 3
                    type = '標準'
                    break
                case state <= 100:
                    state = 5
                    type = 'ターボ'
                    break
            }

            request
                .get(this.host + '/cleaner/set_control_info')
                .query({'pow': 1})
                .query({'mode': 0})
                .query({'airvol': state})
                .query({'humd': humd}) // 現在加湿程度
                .end(function (error, response) {
                    if (error) throw error
                    this.log(`set Rotation Speed: { airvol: ${state}, humd: ${humd} }`);
                    return callback(null);
                }.bind(this));
        } catch (e) {
            this.log('Set Rptation Speed Failed: %s' + e)
            return callback(e)

        }
    },

    getStatusActive: function (callback) {
        this.log('GET STATUS ACTIVE')
        try {
            request
                .get(this.host + '/cleaner/get_unit_info')
                .end(function (error, response) {
                    if (error) {
                        this.log('GET ACTIVE STATE Failed: %s' + error)
                        throw error
                    }
                    const Info = analyzeUnitInfo(response.text)
                    this.AirPurifierInfo = Info.ctrl_info
                    this.SensorInfo = Info.sensor_info
                    this.unitStatus = Info.unit_status

                    return callback(null, this.stateuActive())
                }.bind(this))
        } catch (e) {
            this.log('GET STATUS ACTIVE Failed:' + e)
            return callback(e)
        }
    },

    stateuActive: function () {
        this.AirPurifierInfo.pow == 1
    },

    getAirQuality: function (callback) {
        this.log('GET AIR QUALITY')
        try {

            return callback(null, this.airQuality())
        } catch
            (e) {
            this.log('GET AIR QUALITY Failed:' + e)
            return callback(e)
        }
    },

    airQuality: function () {
        const {pm25, dust, odor} = this.SensorInfo
        let airQuality = Characteristic.AirQuality.UNKNOWN

        if (pm25 >= 0 || dust >= 0 || odor >= 0) airQuality = Characteristic.AirQuality.EXCELLENT;
        if (pm25 > 1 || dust > 1 || odor > 1) airQuality = Characteristic.AirQuality.GOOD;
        if (pm25 > 2 || dust > 2 || odor > 2) airQuality = Characteristic.AirQuality.FAIR;
        if (pm25 > 3 || dust > 3 || odor > 3) airQuality = Characteristic.AirQuality.INFERIOR;
        if (pm25 > 4 || dust > 4 || odor > 4) airQuality = Characteristic.AirQuality.POOR;
        return airQuality
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
        this.log('GET Current Humidity')
        try {
            return callback(null, this.SensorInfo.hhum)
        } catch (e) {
            this.log('GEt Current Humidity Failed: ' + e)
            return callback(e)
        }
    },

    getHumidifierActive: function (callback) {
        this.log('GET Humidifier ACTIVE')
        try {
            request
                .get(this.host + '/cleaner/get_unit_info')
                .end(function (error, response) {
                    if (error) {
                        this.log('GET ACTIVE STATE Failed: %s' + error)
                        throw error
                    }
                    const Info = analyzeUnitInfo(response.text)
                    this.AirPurifierInfo = Info.ctrl_info
                    this.SensorInfo = Info.sensor_info
                    this.unitStatus = Info.unit_status

                    return callback(null, this.humidifierActive())
                }.bind(this))
        } catch (e) {
            this.log('GET Humidifier ACTIVE Failed: ' + e)
            return callback(e)
        }
    },

    humidifierActive: function () {
        const {pow, humd, mode} = this.AirPurifierInfo
        if ((pow == 1) && (humd != 0)) {
            return Characteristic.Active.ACTIVE
        }
        return Characteristic.Active.INACTIVE
    },

    setHumidifierActive: function (state, callback) {
        let query = {}
        if (state == 1) {
            query = {'pow': 1}
            this.log('電源オン')
        } else {
            query = {
                'pow': 1,
                'mode': 0,
                'airvol': 0,
                'humd': 0
            }
            this.log('風量自動、加湿オフ')
        }

        try {
            request
                .get(this.host + '/cleaner/set_control_info')
                .query(query)
                .end(function (error, response) {
                    if (error) throw error
                }.bind(this))
            return callback(null)
        } catch (e) {
            this.log('SET Humidifier ACTIVE STATE Failed: ' + e)
            return callback(e)
        }
    },

    getCurrentHumidifierState: function (callback) {
        this.log('GET CURRENT HUMIDIFIER STATE')
        try {
            request
                .get(this.host + '/cleaner/get_unit_info')
                .end(function (error, response) {
                    if (error) throw error

                    const Info = analyzeUnitInfo(response.text)
                    this.AirPurifierInfo = Info.ctrl_info
                    this.SensorInfo = Info.sensor_info
                    this.unitStatus = Info.unit_status

                    return callback(null, this.currentHumidifierState())
                }.bind(this));
        } catch (error) {
            this.log('GET CURRENT AIR PURFIER STATE Failed: %s' + error)
            return callback(error)
        }
    },

    currentHumidifierState: function () {
        if (this.AirPurifierInfo.pow = 0) return Characteristic.CurrentHumidifierDehumidifierState.INACTIVE
        if (this.AirPurifierInfo.humd = 0) return Characteristic.CurrentHumidifierDehumidifierState.IDLE
        if (this.AirPurifierInfo.humd != 0) Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING
        return Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING // このモードになれないよねw
    },

    getTargetHumidifierState: function (callback) {
        this.log('GET TARGET HUMIDIFIER STATE')
        try {
            request
                .get(this.host + '/cleaner/get_unit_info')
                .end(function (error, response) {
                    if (error) throw error

                    const Info = analyzeUnitInfo(response.text)
                    this.AirPurifierInfo = Info.ctrl_info
                    this.SensorInfo = Info.sensor_info
                    this.unitStatus = Info.unit_status

                    return callback(null, this.targetHumidifierState())
                }.bind(this));
        } catch (error) {
            this.log('GET CURRENT AIR PURFIER STATE Failed: %s' + error)
            return callback(error)
        }
    },

    targetHumidifierState: function () {
        if (this.AirPurifierInfo.humd = 4) return 0  // Auto
        if (this.AirPurifierInfo.humd = 0) return 1 // Dehumidifying
        return 2    // humidifying
    },

    setTargetHumidifierState: function (state, callback) {
        this.log('SET TARGET Humidifier state: ' + state)
        const {airvol} = this.AirPurifierInfo
        let query = {}
        try {
            if (state == 0) {
                // AUTO
                query = {
                    'pow': 1,
                    'mode': 1,
                    'airvol': 0,
                    'humd': 4
                }
                this.log('Target Humidifier state: おまかせ')
            } else if (state == 1) {
                // Humidifying
                query = {
                    'pow': 1,
                    'mode': 0,
                    'airvol': airvol,
                    'humd': 3
                }
                this.log('Target Humidifier state: 高め')
            } else {
                // Dehumidifying
                query = {
                    'pow': 1,
                    'mode': 0,
                    'airvol': airvol,
                    'humd': 1
                }
                this.log('Target Humidifier state: 控えめ')
            }
            request
                .get(this.host + '/cleaner/set_control_info')
                .query(query)
                .end(function (error, response) {
                    if (error) throw error
                }.bind(this))
            return callback(null)
        } catch (e) {
            this.log('SET TARGET Humidifier STATE Failed: %s' + e)
            return callback(e)
        }
    },

    getWaterLevel: function (callback) {
        try {
            if (this.unitStatus.water_supply == 0) {
                return callback(null, 100)
            }
            return callback(null, 10)
        } catch (e) {
            return callback(e)
        }
    },

    updateAll: function () {

        // 开 / 关
        this.airPurifierService
            .getCharacteristic(Characteristic.Active)
            .updateValue(this.activeStatus())

        // 状态
        this.airPurifierService
            .getCharacteristic(Characteristic.CurrentAirPurifierState)
            .updateValue(this.currentAirPurfierState())

        // // 自动 / 手动
        this.airPurifierService
            .getCharacteristic(Characteristic.TargetAirPurifierState)
            .updateValue(this.targetAirPurifierState())

        // // 风速
        this.airPurifierService
            .getCharacteristic(Characteristic.RotationSpeed)
            .updateValue(this.rotationSpeed())

        //加湿器
        this.humidifierDehumidifer
            .getCharacteristic(Characteristic.Active)
            .updateValue(this.humidifierActive())

        this.humidifierDehumidifer
            .getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
            .updateValue(this.currentHumidifierState())

        this.humidifierDehumidifer
            .getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
            .updateValue(this.targetHumidifierState())

        this.humidifierDehumidifer
            .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .updateValue(this.SensorInfo.hhum)

        this.humidifierDehumidifer
            .getCharacteristic(Characteristic.WaterLevel)
            .updateValue(this.unitStatus.water_supply == 0 ? 100 : 10)

        // 空气质量
        // 活动？
        this.airQualitySensor
            .getCharacteristic(Characteristic.StatusActive)
            .updateValue(this.stateuActive())

        this.airQualitySensor
            .getCharacteristic(Characteristic.AirQuality)
            .updateValue(this.airQuality())

        this.airQualitySensor
            .getCharacteristic(Characteristic.PM2_5Density)
            .updateValue(this.SensorInfo.pm25)

        this.airQualitySensor
            .getCharacteristic(Characteristic.SulphurDioxideDensity)
            .updateValue(this.SensorInfo.odor)

        this.airQualitySensor
            .getCharacteristic(Characteristic.VOCDensity)
            .updateValue(this.SensorInfo.dust)

        // 温度計
        //　活躍？
        this.temperatureSensor
            .getCharacteristic(Characteristic.StatusActive)
            .updateValue(this.stateuActive())

        // 温度
        this.temperatureSensor
            .getCharacteristic(Characteristic.CurrentTemperature)
            .updateValue(this.SensorInfo.htemp)

        // 湿度
        this.humiditySensor
            .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .updateValue(this.SensorInfo.hhum)

        this.log('情報を一括更新しました。')
    }

};

function analyzeResponse(text) {
    return JSON.parse('{"' + text.replace(/(=)/g, '":"').replace(/(,)/g, '","') + '"}')
}

function analyzeUnitInfo(text) {
    let obj = analyzeResponse(text)
    for (let key in obj) {
        if (key === 'ret') continue;
        obj[key] = analyzeResponse(unescape(obj[key]))
    }
    return obj
}
