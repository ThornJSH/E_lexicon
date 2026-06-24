/**
 * Describes matching options when performing morphological analysis.
 * These options can be combined using the bitwise OR operator.
 */
export var Match;
(function (Match) {
    Match[Match["none"] = 0] = "none";
    Match[Match["url"] = 1] = "url";
    Match[Match["email"] = 2] = "email";
    Match[Match["hashtag"] = 4] = "hashtag";
    Match[Match["mention"] = 8] = "mention";
    Match[Match["serial"] = 16] = "serial";
    Match[Match["emoji"] = 32] = "emoji";
    Match[Match["oovRuleOnly"] = 0] = "oovRuleOnly";
    Match[Match["oovChrModel"] = 256] = "oovChrModel";
    Match[Match["oovChrFreqModel"] = 512] = "oovChrFreqModel";
    Match[Match["oovChrFreqBranchModel"] = 768] = "oovChrFreqBranchModel";
    Match[Match["oovMask"] = 768] = "oovMask";
    Match[Match["normalizeCoda"] = 65536] = "normalizeCoda";
    Match[Match["joinNounPrefix"] = 131072] = "joinNounPrefix";
    Match[Match["joinNounSuffix"] = 262144] = "joinNounSuffix";
    Match[Match["joinVerbSuffix"] = 524288] = "joinVerbSuffix";
    Match[Match["joinAdjSuffix"] = 1048576] = "joinAdjSuffix";
    Match[Match["joinAdvSuffix"] = 2097152] = "joinAdvSuffix";
    Match[Match["splitComplex"] = 4194304] = "splitComplex";
    Match[Match["zCoda"] = 8388608] = "zCoda";
    Match[Match["compatibleJamo"] = 16777216] = "compatibleJamo";
    Match[Match["splitSaisiot"] = 33554432] = "splitSaisiot";
    Match[Match["mergeSaisiot"] = 67108864] = "mergeSaisiot";
    Match[Match["joinParticleYo"] = 134217728] = "joinParticleYo";
    Match[Match["joinVSuffix"] = 1572864] = "joinVSuffix";
    Match[Match["joinAffix"] = 4063232] = "joinAffix";
    Match[Match["all"] = 8388671] = "all";
    Match[Match["allWithNormalizing"] = 8454207] = "allWithNormalizing";
})(Match || (Match = {}));
export var Space;
(function (Space) {
    Space[Space["none"] = 0] = "none";
    Space[Space["noSpace"] = 1] = "noSpace";
    Space[Space["insertSpace"] = 2] = "insertSpace";
})(Space || (Space = {}));
