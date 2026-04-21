"use strict";

const client = require("@prisma/client");
const { Prisma } = client;
const chartSeed = require("./dist/chart-seed.js");
const pricingModuleSeed = require("./dist/pricing-module-seed.js");

Object.assign(module.exports, client, chartSeed, pricingModuleSeed);
module.exports.Decimal = Prisma.Decimal;
