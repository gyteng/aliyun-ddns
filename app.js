'use strict';
const http = require('http');
const url = require('url');
const alidns = require('./alidns.js');
const config = require('./config.json');

// 这段代码首先会检查已有的记录
// 如果记录不存在, 会新建一个解析, 并返回 created
// 如果记录存在, ip 没变化, 不会更新 ip, 并返回 nochg
// 如果记录存在, ip 有变化, 会更新 ip, 并返回 updated
// 如果阿里云端返回 400 错误, 则返回 error
const updateRecord = (target, callback) => {
  const ip = target.ip;
  const subDomain = target.hostname;
  const domainName = subDomain.split('.').slice(-2).join('.');
  const rr = subDomain.split('.').slice(0, -2).join('.');
  const describeSubParams = {
    Action: 'DescribeSubDomainRecords',
    SubDomain: subDomain
  };
  const updateParmas = {
    Action: 'UpdateDomainRecord',
    RecordId: '',
    RR: rr,
    Type: 'A',
    Value: ip
  };
  const addParmas = {
    Action: 'AddDomainRecord',
    DomainName: domainName,
    RR: rr,
    Type: 'A',
    Value: ip
  };
  // 首先获取域名信息, 目的是获取要更新的域名的 RecordId
  http.request({
    host: alidns.ALIDNS_HOST,
    path: alidns.getPath(describeSubParams)
  }, res => {
    let body = [];
    res
      .on('data', chunk => body.push(chunk))
      .on('end', () => {
        body = Buffer.concat(body).toString();
        const result = JSON.parse(body);
        // 获取要更新的域名的 RecordId, 并检查是否需要更新
        let shouldUpdate = false;
        let shouldAdd = true;
        result.DomainRecords.Record
          .filter(record => record.RR === updateParmas.RR)
          .forEach(record => {
            shouldAdd = false;
            if (record.Value !== updateParmas.Value) {
              shouldUpdate = true;
              updateParmas.RecordId = record.RecordId;
            }
          });
        if (shouldUpdate) {
          // 更新域名的解析
          http.request({
            host: alidns.ALIDNS_HOST,
            path: alidns.getPath(updateParmas)
          }, res => {
            if (res.statusCode === 200) {
              callback('updated');
            } else {
              callback('error');
            }
          }).end();
        } else if (shouldAdd) {
          // 增加新的域名解析
          http.request({
            host: alidns.ALIDNS_HOST,
            path: alidns.getPath(addParmas)
          }, res => {
            if (res.statusCode === 200) {
              callback('added');
            } else {
              callback('error');
            }
          }).end();
        } else {
          callback('nochg');
        }
      });
  }).end();
};

const getIp = () => {
  return new Promise((resolve, reject) => {
    http.request({
      host: 'members.3322.org',
      path: '/dyndns/getipcurl'
    }, res => {
      let body = [];
      res
        .on('data', chunk => body.push(chunk))
        .on('end', () => {
          body = Buffer.concat(body).toString();
          resolve(body.trim());
        });
    }).end();
  });
};

getIp().then(ip => {
  const target = {
    ip,
    hostname: config.hostname,
  };
  updateRecord(target, msg => {
    console.log(msg);
  });
});